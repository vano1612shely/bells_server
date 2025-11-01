// src/mondial-relay/mondial-relay.service.ts
import axios from 'axios';
import * as crypto from 'crypto';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

interface FindArgs {
  postalCode?: string;
  address?: string;
  country?: string;
}

@Injectable()
export class MondialRelayService {
  private readonly logger = new Logger(MondialRelayService.name);
  private readonly enseigne = process.env.MONDIAL_RELAY_ENSEIGNE || 'CC23OHY2';
  private readonly privateKey = process.env.MONDIAL_RELAY_PRIVATE || '87Ez14W3';
  private readonly endpoint = 'https://api.mondialrelay.com/WebService.asmx';

  // простий in-memory кеш для геокодування
  private geocodeCache = new Map<string, { lat: number; lon: number }>();

  /**
   * Геокодування адреси через OpenStreetMap Nominatim API.
   * @param address - повна адреса (наприклад, "85 RUE REAUMUR 75002 PARIS, France")
   */
  private async geocodeAddress(
    address: string,
  ): Promise<{ lat: number; lon: number } | null> {
    // Якщо в кеші — повертаємо збережені координати
    if (this.geocodeCache.has(address)) {
      return this.geocodeCache.get(address)!;
    }

    try {
      const resp = await axios.get(
        'https://nominatim.openstreetmap.org/search',
        {
          params: {
            q: address,
            format: 'json',
            addressdetails: 1,
            limit: 1,
          },
          headers: {
            'User-Agent': 'LukanExchange/1.0 (contact@lukan.exchange)',
          },
          timeout: 8000,
        },
      );

      const results = resp.data;
      if (Array.isArray(results) && results.length > 0) {
        const best = results[0];
        const lat = parseFloat(best.lat);
        const lon = parseFloat(best.lon);

        if (!isNaN(lat) && !isNaN(lon)) {
          const coords = { lat, lon };
          this.geocodeCache.set(address, coords);
          // невелика затримка для уникнення rate-limit
          await new Promise((r) => setTimeout(r, 250));
          return coords;
        }
      }

      this.logger.warn(`Nominatim: no coordinates for "${address}"`);
      return null;
    } catch (err) {
      this.logger.warn(
        `Nominatim geocode failed for "${address}": ${err.message}`,
      );
      return null;
    }
  }

  /**
   * Пошук пунктів Mondial Relay за індексом або адресою.
   */
  async findPickupPoints(args: FindArgs) {
    const { postalCode: pcInput, address, country = 'FR' } = args;

    const postalCode = pcInput ?? '';
    let ville = '';
    let centerLat: number | null = null;
    let centerLon: number | null = null;

    // Якщо передано адресу, а не індекс — геокодуємо
    if (!postalCode && address) {
      const geoRes = await this.geocodeAddress(address);
      if (geoRes) {
        centerLat = geoRes.lat;
        centerLon = geoRes.lon;
      }
      // пробуємо витягти місто з адреси
      ville = address.split(' ').slice(-1)[0] || '';
    }

    const params = {
      Enseigne: this.enseigne,
      Pays: country,
      Ville: ville,
      CP: postalCode,
      Taille: '',
      Poids: '',
      Action: '',
      RayonRecherche: '10',
      NbResults: '50',
    };

    // Підпис (MD5)
    const concat =
      params.Enseigne +
      params.Pays +
      params.Ville +
      params.CP +
      params.Taille +
      params.Poids +
      params.Action +
      params.RayonRecherche +
      params.NbResults +
      this.privateKey;

    const Security = crypto
      .createHash('md5')
      .update(concat, 'utf8')
      .digest('hex')
      .toUpperCase();

    // SOAP XML
    const xml = `<?xml version="1.0" encoding="utf-8"?>
      <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                     xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                     xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body>
          <WSI2_RecherchePointRelais xmlns="http://www.mondialrelay.fr/webservice/">
            <Enseigne>${params.Enseigne}</Enseigne>
            <Pays>${params.Pays}</Pays>
            <Ville>${params.Ville}</Ville>
            <CP>${params.CP}</CP>
            <Taille>${params.Taille}</Taille>
            <Poids>${params.Poids}</Poids>
            <Action>${params.Action}</Action>
            <RayonRecherche>${params.RayonRecherche}</RayonRecherche>
            <NbResults>${params.NbResults}</NbResults>
            <Security>${Security}</Security>
          </WSI2_RecherchePointRelais>
        </soap:Body>
      </soap:Envelope>`;

    try {
      const response = await axios.post(this.endpoint, xml, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction:
            '"http://www.mondialrelay.fr/webservice/WSI2_RecherchePointRelais"',
        },
        timeout: 15000,
      });

      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
      });
      const json = parser.parse(response.data);

      const result =
        json['soap:Envelope']?.['soap:Body']?.[
          'WSI2_RecherchePointRelaisResponse'
        ]?.['WSI2_RecherchePointRelaisResult'];

      if (!result) {
        this.logger.warn('MondialRelay: empty result');
        return {
          points: [],
          center:
            centerLat && centerLon ? { lat: centerLat, lon: centerLon } : null,
        };
      }

      if (result?.STAT && result.STAT !== '0') {
        throw new InternalServerErrorException(
          `Mondial Relay error code: ${result.STAT}`,
        );
      }

      // 🔹 Формуємо список пунктів
      const points: any[] = [];

      Object.keys(result)
        .filter((key) => key.startsWith('PR'))
        .forEach((key) => {
          const pr = result[key];
          if (!pr) return;

          const item = {
            id: pr.Num || `${pr.CP}_${pr.Ville}_${pr.LgAdr1}`,
            name: pr.LgAdr1 || '',
            address: [pr.LgAdr3, pr.LgAdr4].filter(Boolean).join(', '),
            cp: pr.CP || '',
            city: pr.Ville || '',
            lat: null,
            lon: null,
            raw: pr,
          };
          points.push(item);
        });

      // 🔹 Геокодуємо точки без координат
      for (const p of points) {
        if (!p.lat || !p.lon) {
          const addr = `${p.raw.LgAdr3 || ''} ${p.raw.CP || ''} ${p.raw.Ville || ''}, France`;
          const geo = await this.geocodeAddress(addr);

          if (geo) {
            p.lat = geo.lat;
            p.lon = geo.lon;
          } else {
            // fallback — Париж
            p.lat = 48.8566;
            p.lon = 2.3522;
          }
        }
      }

      // 🔹 Центр карти — або знайдений центр, або перший пункт
      const center =
        centerLat && centerLon
          ? { lat: centerLat, lon: centerLon }
          : points.length > 0
            ? { lat: points[0].lat, lon: points[0].lon }
            : null;

      return { points, center };
    } catch (err) {
      this.logger.error('Mondial Relay request failed: ' + err.message);
      throw new InternalServerErrorException(
        'Mondial Relay request failed: ' + err.message,
      );
    }
  }
}
