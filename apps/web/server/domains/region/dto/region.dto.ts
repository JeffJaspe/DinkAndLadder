export interface RegionRecord {
  id: string
  code: string
  name: string
  sort_order: number
  created_at: string
}

export interface RegionDto {
  id: string
  code: string
  name: string
}

export function toRegionDto(record: RegionRecord): RegionDto {
  return {
    id: record.id,
    code: record.code,
    name: record.name
  }
}

export interface ProvinceRecord {
  id: string
  region_id: string
  name: string
  sort_order: number
  created_at: string
}

export interface ProvinceDto {
  id: string
  region_id: string
  name: string
}

export function toProvinceDto(record: ProvinceRecord): ProvinceDto {
  return {
    id: record.id,
    region_id: record.region_id,
    name: record.name
  }
}
