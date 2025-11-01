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
  query: string; // індекс або адреса
  country?: string; // дефолт FR
}

type Coords = { lat: number; lon: number };

type GeoAddressParts = {
  coords: Coords | null;
  city: string; // нормалізована назва міста
  postcode: string; // нормалізований індекс
  countryCode: string; // ISO2 (FR/BE/ES/...)
};

@Injectable()
export class MondialRelayService {
  private readonly logger = new Logger(MondialRelayService.name);
  private readonly enseigne = process.env.MONDIAL_RELAY_ENSEIGNE || 'CC23OHY2';
  private readonly privateKey = process.env.MONDIAL_RELAY_PRIVATE || '87Ez14W3';
  private readonly endpoint = 'https://api.mondialrelay.com/WebService.asmx';

  private geocodeCache = new Map<string, GeoAddressParts>();

  // ────────────────────────────────────────────────────────────────────────────────
  // Геокодування адреси з нормалізацією міста/індексу/країни
  // ────────────────────────────────────────────────────────────────────────────────
  private async geocodeAddress(q: string): Promise<GeoAddressParts> {
    if (this.geocodeCache.has(q)) {
      return this.geocodeCache.get(q)!;
    }

    try {
      const { data } = await axios.get(
        'https://nominatim.openstreetmap.org/search',
        {
          params: {
            q,
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

      let out: GeoAddressParts = {
        coords: null,
        city: '',
        postcode: '',
        countryCode: 'FR',
      };

      if (Array.isArray(data) && data.length > 0) {
        const best = data[0];
        const addr = best.address || {};
        const lat = parseFloat(best.lat);
        const lon = parseFloat(best.lon);

        // Нормалізація міста
        const city =
          addr.city ||
          addr.town ||
          addr.village ||
          addr.hamlet ||
          addr.municipality ||
          '';

        // Нормалізація індексу
        const postcode = addr.postcode ? String(addr.postcode) : '';

        const countryCode = (addr.country_code || 'fr').toUpperCase();

        out = {
          coords: isNaN(lat) || isNaN(lon) ? null : { lat, lon },
          city,
          postcode,
          countryCode,
        };
      }

      // невелика пауза проти rate-limit
      await new Promise((r) => setTimeout(r, 250));

      this.geocodeCache.set(q, out);
      return out;
    } catch (err: any) {
      this.logger.warn(`Nominatim failed for "${q}": ${err.message}`);
      return {
        coords: null,
        city: '',
        postcode: '',
        countryCode: 'FR',
      };
    }
  }

  // ────────────────────────────────────────────────────────────────────────────────
  // Хелпер: безпечне читання STAT як числа
  // ────────────────────────────────────────────────────────────────────────────────
  private statIsOk(stat: unknown): boolean {
    if (stat === undefined || stat === null) return true; // інколи STAT відсутній але є PR-дані
    const n = typeof stat === 'string' ? Number(stat) : stat;
    return Number(n) === 0;
  }

  // ────────────────────────────────────────────────────────────────────────────────
  // Хелпер: витягнути PR-елементи з будь-якої форми відповіді
  // ────────────────────────────────────────────────────────────────────────────────
  private extractPRs(result: any): any[] {
    if (!result || typeof result !== 'object') return [];

    // Випадок PR01..PR10/PRxx
    const byKeys = Object.keys(result)
      .filter((k) => /^PR\d{2}$/.test(k) && result[k])
      .map((k) => result[k]);

    if (byKeys.length) return byKeys;

    // Інші можливі структури (інколи обгорнуто в масив/вузол)
    const candidates = ['PR', 'Points', 'PointRelais', 'ListePR', 'ArrayOfPR'];
    for (const key of candidates) {
      const node = result[key];
      if (!node) continue;
      if (Array.isArray(node)) return node;
      if (typeof node === 'object') {
        // інколи node = { PR: [...] }
        if (Array.isArray(node.PR)) return node.PR;
        // або node = { PR01: {...}, PR02: {...} }
        const nestedKeys = Object.keys(node).filter((k) => /^PR\d{2}$/.test(k));
        if (nestedKeys.length) return nestedKeys.map((k) => node[k]);
      }
    }
    return [];
  }

  // ────────────────────────────────────────────────────────────────────────────────
  // Основний пошук
  // ────────────────────────────────────────────────────────────────────────────────
  async findPickupPoints(args: FindArgs) {
    const { query, country: countryInput } = args;

    const looksLikePostal = /^\d{4,6}$/.test(query); // покриває FR (5), BE (4), ES (5) тощо
    let CP = '';
    let Ville = '';
    let country = (countryInput || 'FR').toUpperCase();
    let center: Coords | null = null;

    if (looksLikePostal) {
      CP = query;
    } else {
      // Геокодуємо адресу → витягуємо місто/індекс/країну
      const geo = await this.geocodeAddress(query);
      center = geo.coords;
      // якщо geocode дав індекс — використовуємо його; інакше хоча б місто
      CP = geo.postcode || '';
      Ville = geo.city || '';
      country = geo.countryCode || country;
    }

    // Якщо маємо і CP, і Ville порожні — шансів немає → повертаємо пусто, але з центром якщо був
    if (!CP && !Ville) {
      return {
        points: [],
        center,
      };
    }

    const params = {
      Enseigne: this.enseigne,
      Pays: country,
      Ville: Ville,
      CP: CP,
      Taille: '',
      Poids: '',
      Action: '',
      RayonRecherche: '10',
      NbResults: '50',
    };

    // Підпис
    const securityConcat =
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
      .update(securityConcat, 'utf8')
      .digest('hex')
      .toUpperCase();

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
      const { data } = await axios.post(this.endpoint, xml, {
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
        parseTagValue: true,
        parseAttributeValue: true,
        trimValues: true,
      });

      const json = parser.parse(data);

      const result =
        json['soap:Envelope']?.['soap:Body']?.[
          'WSI2_RecherchePointRelaisResponse'
        ]?.['WSI2_RecherchePointRelaisResult'];

      // Якщо взагалі нічого — повертаємо пусто (але з центром, якщо був)
      if (!result) {
        this.logger.warn('MondialRelay: empty result node');
        return { points: [], center };
      }

      // STAT інколи число/рядок або відсутній зовсім — враховуємо все
      if (!this.statIsOk(result.STAT)) {
        // Логи з діагностикою
        this.logger.warn(`MondialRelay STAT != 0: ${result.STAT}`);
        return { points: [], center };
      }

      // Дістаємо PR*
      const rawPRs = this.extractPRs(result);
      if (!rawPRs.length) {
        // інколи дані лежать ще глибше всередині Result
        const deepKeys = Object.keys(result).filter(
          (k) => typeof result[k] === 'object',
        );
        for (const k of deepKeys) {
          const deeper = this.extractPRs(result[k]);
          if (deeper.length) {
            rawPRs.push(...deeper);
            break;
          }
        }
      }

      if (!rawPRs.length) {
        return { points: [], center };
      }

      // Нормалізація точок
      const points = await Promise.all(
        rawPRs.map(async (pr: any) => {
          const cp = pr.CP ? String(pr.CP) : '';
          const city = pr.Ville || '';
          const line3 = pr.LgAdr3 || '';
          const name = pr.LgAdr1 || '';

          let lat: number | null = null;
          let lon: number | null = null;

          // У відповіді MR координат зазвичай немає — геокодуємо адресу пункту
          const fullAddr = `${line3} ${cp} ${city}, ${country}`;
          const geo = await this.geocodeAddress(fullAddr);
          if (geo.coords) {
            lat = geo.coords.lat;
            lon = geo.coords.lon;
          } else {
            // fallback — центр Парижа (щоб карта не ламалась)
            lat = 48.8566;
            lon = 2.3522;
          }

          return {
            id: pr.Num || `${cp}_${city}_${name}`.replace(/\s+/g, '_'),
            name,
            address: [line3, pr.LgAdr4].filter(Boolean).join(', '),
            cp,
            city,
            lat,
            lon,
            raw: pr,
          };
        }),
      );

      // Центр карти: заданий із геокоду адреси, або перша точка
      const finalCenter =
        center ??
        (points.length ? { lat: points[0].lat, lon: points[0].lon } : null);

      return { points, center: finalCenter };
    } catch (err: any) {
      this.logger.error('Mondial Relay request failed: ' + err.message);
      throw new InternalServerErrorException(
        'Mondial Relay request failed: ' + err.message,
      );
    }
  }
}
