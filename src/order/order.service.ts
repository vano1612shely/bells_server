import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Not, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Order } from './entities/order.entity';
import { OrderItem, BackSideType } from './entities/order-item.entity';
import { Delivery } from './entities/delivery.entity';
import {
  CreateOrderDto,
  OrderQueryDto,
  UpdateOrderStatusDto,
} from './dto/order.dto';
import { PriceService } from '../price/price.service';
import { OrderStatus } from './enums/order-status.enum';
import { getUploadsDir, pathRelativeToUploads } from '../files/multer.util';
import { FilesService } from '../files/files.service';
import { EmailService } from '../notifications/email.service';
import PDFDocument from 'pdfkit';
import type * as PDFKit from 'pdfkit';

@Injectable()
export class OrderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderService.name);
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,

    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,

    @InjectRepository(Delivery)
    private deliveryRepository: Repository<Delivery>,

    private priceService: PriceService,
    private filesService: FilesService,
    private emailService: EmailService,
  ) {}

  async onModuleInit() {
    await this.runCleanupSafely();

    const oneHour = 60 * 60 * 1000;
    this.cleanupInterval = setInterval(() => {
      void this.runCleanupSafely();
    }, oneHour);
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
  async create(
    createOrderDto: CreateOrderDto,
    files: {
      originImage?: Express.Multer.File[];
      image?: Express.Multer.File[];
      backOriginImage?: Express.Multer.File[];
      backImage?: Express.Multer.File[];
    },
  ): Promise<Order> {
    const totalQuantity = createOrderDto.items.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0,
    );

    const priceCalculation =
      await this.priceService.calculatePrice(totalQuantity);

    const delivery = new Delivery();
    delivery.type = createOrderDto.delivery.type;
    if (delivery.type === 'home' && createOrderDto.delivery.address) {
      const addr = createOrderDto.delivery.address;
      delivery.name = addr.name;
      delivery.street = addr.street;
      delivery.additional = addr.additional;
      delivery.postalCode = addr.postalCode;
      delivery.city = addr.city;
      delivery.phone = addr.phone;
    } else if (delivery.type === 'relay' && createOrderDto.delivery.relay) {
      const relay = createOrderDto.delivery.relay;
      delivery.relayPhone = relay.phone;
      if (relay.point) {
        delivery.relayPoint =
          typeof relay.point === 'string'
            ? JSON.parse(relay.point)
            : relay.point;
      } else {
        delivery.relayPoint = null;
      }
    }

    await this.deliveryRepository.save(delivery);

    const order = this.orderRepository.create({
      name: createOrderDto.name,
      email: createOrderDto.email,
      status: OrderStatus.CREATED,
      pricePerUnit: priceCalculation.basePrice,
      totalPrice: priceCalculation.totalPrice,
      discount: priceCalculation.discount,
      totalPriceWithDiscount: priceCalculation.totalPriceWithDiscount,
      totalQuantity,
      delivery,
    });

    const savedOrder = await this.orderRepository.save(order);

    const orderItems: OrderItem[] = [];

    for (let i = 0; i < createOrderDto.items.length; i++) {
      const itemDto = createOrderDto.items[i];
      const orderItem = new OrderItem();

      orderItem.quantity = Number(itemDto.quantity);

      if (typeof itemDto.characteristics === 'string') {
        try {
          orderItem.characteristics = JSON.parse(itemDto.characteristics);
        } catch {
          orderItem.characteristics = {};
        }
      } else {
        orderItem.characteristics = itemDto.characteristics;
      }

      orderItem.orderId = savedOrder.id;

      if (files.originImage?.[i]) {
        const originImagePath = pathRelativeToUploads(
          files.originImage[i].path,
        );
        orderItem.originImagePath =
          this.filesService.buildFileUrl(originImagePath);
      }
      if (files.image?.[i]) {
        const imagePath = pathRelativeToUploads(files.image[i].path);
        orderItem.imagePath = this.filesService.buildFileUrl(imagePath);
      }

      const backSideType = itemDto.backSideType || BackSideType.TEMPLATE;
      orderItem.backSideType = backSideType;

      if (backSideType === BackSideType.TEMPLATE) {
        orderItem.backTemplateId = itemDto.backTemplateId || null;
      } else {
        if (files.backOriginImage?.[i]) {
          const backOriginImagePath = pathRelativeToUploads(
            files.backOriginImage[i].path,
          );
          orderItem.backOriginImagePath =
            this.filesService.buildFileUrl(backOriginImagePath);
        }
        if (files.backImage?.[i]) {
          const backImagePath = pathRelativeToUploads(files.backImage[i].path);
          orderItem.backImagePath =
            this.filesService.buildFileUrl(backImagePath);
        }
      }

      orderItems.push(orderItem);
    }

    await this.orderItemRepository.save(orderItems);

    return this.findOne(savedOrder.id);
  }

  async findAll(
    query: OrderQueryDto,
  ): Promise<{ data: Order[]; total: number; page: number; limit: number }> {
    const { status, email, page = 1, limit = 10 } = query;

    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('order.delivery', 'delivery')
      .orderBy('order.createdAt', 'DESC');

    if (status) queryBuilder.andWhere('order.status = :status', { status });
    if (email)
      queryBuilder.andWhere('order.email LIKE :email', { email: `%${email}%` });

    const [data, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }
  async findOne(id: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['items', 'delivery'],
    });

    if (!order) {
      throw new NotFoundException(
        `La commande avec l’ID ${id} est introuvable.`,
      );
    }

    return order;
  }

  async updateStatus(
    id: string,
    updateStatusDto: UpdateOrderStatusDto,
  ): Promise<Order> {
    const order = await this.findOne(id);
    order.status = updateStatusDto.status;
    if (order.status === OrderStatus.PAID) {
      void this.emailService.sendOrderConfirmation(order);
    }
    await this.orderRepository.save(order);
    return this.findOne(id);
  }

  async generateOrderPdfBase64(
    id: string,
  ): Promise<{ file_name: string; file_content: string }> {
    const order = await this.findOne(id);
    const fontPath = this.getFontPath();

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];

    return await new Promise<{ file_name: string; file_content: string }>(
      (resolve, reject) => {
        doc.on('data', (chunk) =>
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
        );
        doc.on('error', (err) => reject(err));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(chunks);
          resolve({
            file_name: `order-${id}.pdf`,
            file_content: pdfBuffer.toString('base64'),
          });
        });

        void this.composeOrderPdf(doc, order, fontPath)
          .then(() => doc.end())
          .catch((err) => {
            this.logger.error('Failed to build order PDF', err as Error);
            doc.end();
            reject(err);
          });
      },
    );
  }

  private async composeOrderPdf(
    doc: PDFKit.PDFDocument,
    order: Order,
    fontPath: string | null,
  ) {
    if (fontPath) {
      doc.registerFont('NotoSans', fontPath);
      doc.font('NotoSans');
    }

    const addSectionTitle = (title: string) => {
      doc.moveDown(0.4);
      doc.fontSize(13).fillColor('#111').text(title, { underline: true });
      doc.moveDown(0.15);
    };

    const divider = () => {
      const x = doc.page.margins.left;
      const width =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;
      doc.moveTo(x, doc.y).lineTo(x + width, doc.y).stroke('#e5e7eb');
      doc.moveDown(0.3);
    };

    doc.fontSize(18).fillColor('#111').text(`Order #${order.id}`);
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor('#555');
    doc.text(`Created: ${new Date(order.createdAt).toLocaleString()}`);
    doc.text(`Status: ${order.status}`);
    doc.text(`Customer: ${order.name}`);
    doc.text(`Email: ${order.email}`);

    addSectionTitle('Summary');
    doc.fontSize(11).fillColor('#222');
    doc.text(`Total quantity: ${order.totalQuantity}`);
    doc.text(`Price per unit: ${this.formatCurrency(order.pricePerUnit)}`);
    doc.text(`Subtotal: ${this.formatCurrency(order.totalPrice)}`);
    doc.text(`Discount: ${this.formatCurrency(order.discount)}`);
    doc.text(`Total: ${this.formatCurrency(order.totalPriceWithDiscount)}`);

    divider();

    addSectionTitle('Delivery');
    doc.fontSize(11);
    doc.text(`Type: ${order.delivery.type}`);
    if (order.delivery.type === 'home') {
      doc.text(`Name: ${this.formatText(order.delivery.name)}`);
      doc.text(`Street: ${this.formatText(order.delivery.street)}`);
      doc.text(`Additional: ${this.formatText(order.delivery.additional)}`);
      doc.text(`Postal code: ${this.formatText(order.delivery.postalCode)}`);
      doc.text(`City: ${this.formatText(order.delivery.city)}`);
      doc.text(`Phone: ${this.formatText(order.delivery.phone)}`);
    } else {
      doc.text(`Phone: ${this.formatText(order.delivery.relayPhone)}`);
      const relay = order.delivery.relayPoint;
      if (relay) {
        doc.text(`Relay ID: ${this.formatText(relay.id)}`);
        doc.text(`Address 1: ${this.formatText(relay.LgAdr1)}`);
        if (relay.LgAdr2) doc.text(`Address 2: ${relay.LgAdr2}`);
        if (relay.LgAdr3) doc.text(`Address 3: ${relay.LgAdr3}`);
        if (relay.LgAdr4) doc.text(`Address 4: ${relay.LgAdr4}`);
        doc.text(`City: ${this.formatText(relay.Ville || relay.city)}`);
        doc.text(`Postal code: ${this.formatText(relay.CP || relay.cp)}`);
        doc.text(`Country: ${this.formatText(relay.Pays)}`);
      }
    }

    divider();

    addSectionTitle('Items');
    if (!order.items.length) {
      doc.fontSize(11).text('No items found for this order.');
      return;
    }

    for (let index = 0; index < order.items.length; index++) {
      const item = order.items[index];
      doc.fontSize(12).fillColor('#111').text(`Item ${index + 1}`);
      doc
        .fontSize(10)
        .fillColor('#444')
        .text(
          `Qty: ${item.quantity} | Back: ${item.backSideType}${
            item.backSideType === BackSideType.TEMPLATE
              ? ` | Template: ${this.formatText(item.backTemplateId)}`
              : ''
          }`,
        );

      if (item.characteristics && Object.keys(item.characteristics).length) {
        const characteristics = Object.entries(item.characteristics)
          .map(([key, value]) => `${key}: ${value}`)
          .join(' | ');
        doc.text(`Characteristics: ${characteristics}`);
      }

      await this.insertImage(doc, 'Front (original)', item.originImagePath);
      await this.insertImage(doc, 'Front (processed)', item.imagePath);

      if (item.backSideType === BackSideType.CUSTOM) {
        await this.insertImage(
          doc,
          'Back (original)',
          item.backOriginImagePath,
        );
        await this.insertImage(
          doc,
          'Back (processed)',
          item.backImagePath,
        );
      }

      divider();
    }
  }

  async remove(id: string): Promise<void> {
    const order = await this.findOne(id);

    await this.removeOrderFiles(order);
    await this.orderRepository.remove(order);
  }

  private async runCleanupSafely() {
    try {
      await this.removeExpiredUnpaidOrders();
    } catch (error) {
      this.logger.error(
        'Failed to remove expired unpaid orders',
        error as Error,
      );
    }
  }

  private async removeExpiredUnpaidOrders(): Promise<void> {
    const deadline = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const staleOrders = await this.orderRepository.find({
      where: {
        status: Not(OrderStatus.PAID),
        paidAt: IsNull(),
        createdAt: LessThan(deadline),
      },
      relations: ['items', 'delivery'],
    });

    if (!staleOrders.length) return;

    for (const order of staleOrders) {
      await this.removeOrderFiles(order);
    }

    await this.orderRepository.remove(staleOrders);
    this.logger.log(
      `Removed ${staleOrders.length} unpaid orders older than 24 hours`,
    );
  }

  private async removeOrderFiles(order: Order): Promise<void> {
    for (const item of order.items) {
      const filesToDelete = [
        item.originImagePath,
        item.imagePath,
        item.backOriginImagePath,
        item.backImagePath,
      ];

      for (const filePath of filesToDelete) {
        const relativePath = this.toUploadsRelativePath(filePath);
        if (!relativePath) continue;

        await this.filesService.removeFile(relativePath);
      }
    }
  }

  private toUploadsRelativePath(filePath?: string | null): string | null {
    if (!filePath) return null;

    let normalized = filePath.replace(/\\/g, '/');

    try {
      const url = new URL(normalized);
      normalized = url.pathname;
    } catch {
      // not an absolute URL, keep as-is
    }

    const uploadsPrefix = '/uploads/';
    const plainPrefix = 'uploads/';

    if (normalized.startsWith(uploadsPrefix)) {
      return normalized.slice(uploadsPrefix.length);
    }

    if (normalized.startsWith(plainPrefix)) {
      return normalized.slice(plainPrefix.length);
    }

    return normalized.replace(/^\/+/, '');
  }

  private async insertImage(
    doc: PDFKit.PDFDocument,
    label: string,
    filePath?: string | null,
  ) {
    const buffer = await this.readImageBuffer(filePath);
    if (!buffer) return;

    doc.moveDown(0.25);
    doc.fontSize(11).text(label);
    doc.image(buffer, {
      fit: [150, 150],
    });
  }

  private async readImageBuffer(
    filePath?: string | null,
  ): Promise<Buffer | null> {
    if (!filePath) return null;
    const relativePath = this.toUploadsRelativePath(filePath);
    if (!relativePath) return null;

    const fullPath = path.join(getUploadsDir(), relativePath);
    try {
      return await fs.promises.readFile(fullPath);
    } catch {
      this.logger.warn(`Could not load image for PDF: ${fullPath}`);
      return null;
    }
  }

  private getFontPath(): string | null {
    const fontPath = path.join(
      process.cwd(),
      'assets',
      'fonts',
      'NotoSans-Regular.ttf',
    );
    return fs.existsSync(fontPath) ? fontPath : null;
  }

  private formatCurrency(value: number | string): string {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return `${value}`;
    return new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(numeric);
  }

  private formatText(value?: string | number | null): string {
    if (value === null || value === undefined) return '-';
    return String(value);
  }
}






