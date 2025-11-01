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

  // геокодування адреси через Nominatim
  private async geocodeAddress(address: string) {
    try {
      const resp = await axios.get(
        'https://nominatim.openstreetmap.org/search',
        {
          params: {
            q: address,
            format: 'json',
            addressdetails: 1,
            limit: 5,
          },
          headers: { 'User-Agent': 'YourAppName/1.0 (contact@example.com)' },
        },
      );
      return resp.data; // масив результатів
    } catch (err) {
      this.logger.warn('Nominatim geocode failed: ' + err.message);
      return null;
    }
  }

  async findPickupPoints(args: FindArgs) {
    const { postalCode: pcInput, address, country = 'FR' } = args;

    let postalCode = pcInput ?? '';
    let ville = '';
    let centerLat: number | null = null;
    let centerLon: number | null = null;

    if (!postalCode && address) {
      const geores = await this.geocodeAddress(address);
      if (geores && geores.length > 0) {
        const best = geores[0];
        // пробуємо взяти postcode і city з address
        postalCode = best.address?.postcode || '';
        ville =
          best.address?.city ||
          best.address?.town ||
          best.address?.village ||
          best.display_name ||
          '';
        centerLat = parseFloat(best.lat);
        centerLon = parseFloat(best.lon);
      } else {
        // fallback: використаємо частину адреси як Ville
        ville = address;
      }
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
        timeout: 10000,
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

      const points: any[] = [];

      // Проходимо по ключам, що починаються на PR
      Object.keys(result)
        .filter((key) => key.startsWith('PR'))
        .forEach((key) => {
          const pr = result[key];
          if (!pr) return;
          // структури PR можуть бути як об'єкт, так і масив
          // тут припустимо, що pr — об'єкт з полями: Num, Ligne1, Ligne2, CP, Ville, Latitude, Longitude, Type, etc.
          const item = {
            id: pr.Num || pr.Code || `${pr.CP}_${pr.Ville}_${pr.Ligne1}`,
            name: pr.Ligne1 || pr.enseigne || pr.Nom || '',
            address: [pr.Ligne1, pr.Ligne2, pr.Ligne3]
              .filter(Boolean)
              .join(', '),
            cp: pr.CP || pr.CodePostal || '',
            city: pr.Ville || '',
            lat: pr.Latitude
              ? parseFloat(pr.Latitude)
              : pr.Lat
                ? parseFloat(pr.Lat)
                : null,
            lon: pr.Longitude
              ? parseFloat(pr.Longitude)
              : pr.Lon
                ? parseFloat(pr.Lon)
                : null,
            type: pr.Type || pr.TypePoint || '',
            schedule: pr.Horaires || pr.Horaire || '',
            raw: pr,
          };
          points.push(item);
        });

      return {
        points,
        center:
          centerLat && centerLon ? { lat: centerLat, lon: centerLon } : null,
      };
    } catch (err) {
      this.logger.error('Mondial Relay request failed: ' + err.message);
      throw new InternalServerErrorException(
        'Mondial Relay request failed: ' + err.message,
      );
    }
  }
}
