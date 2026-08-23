interface Province {
  code: string
  name: string
  regionCode: string
}

interface CityMunicipality {
  code: string
  name: string
  provinceCode: string
  isCity: boolean
}

interface Barangay {
  code: string
  name: string
  cityCode: string
}

// Use local proxy endpoints to avoid CORS issues with external PSGC API
const LOCATIONS_BASE = '/api/v1/locations'

// NCR is a region, not a province, but we include it for convenience
const NCR_CODE = '130000000'
const NCR_ENTRY: Province = {
  code: NCR_CODE,
  name: 'NCR (National Capital Region)',
  regionCode: NCR_CODE
}

export function useLocationPicker() {
  const provinces = ref<Province[]>([])
  const cities = ref<CityMunicipality[]>([])
  const barangays = ref<Barangay[]>([])

  const selectedProvince = ref<string>('')
  const selectedCity = ref<string>('')
  const selectedBarangay = ref<string>('')

  const loadingProvinces = ref(false)
  const loadingCities = ref(false)
  const loadingBarangays = ref(false)

  const provinceName = computed(() => {
    const p = provinces.value.find(p => p.code === selectedProvince.value)
    return p?.name ?? ''
  })

  const cityName = computed(() => {
    const c = cities.value.find(c => c.code === selectedCity.value)
    return c?.name ?? ''
  })

  const barangayName = computed(() => {
    const b = barangays.value.find(b => b.code === selectedBarangay.value)
    return b?.name ?? ''
  })

  async function loadProvinces() {
    if (provinces.value.length > 0) return
    loadingProvinces.value = true
    try {
      const response = await $fetch<Array<{ code: string; name: string; regionCode: string }> | string>(
        `${LOCATIONS_BASE}/provinces`
      )
      const data = typeof response === 'string' ? JSON.parse(response) : response
      if (data && Array.isArray(data)) {
        const sorted = data.map(p => ({
          code: p.code,
          name: p.name,
          regionCode: p.regionCode
        })).sort((a, b) => a.name.localeCompare(b.name))
        // Add NCR at the top since it's commonly selected
        provinces.value = [NCR_ENTRY, ...sorted]
      }
    } catch (err) {
      console.error('Failed to load provinces:', err)
    } finally {
      loadingProvinces.value = false
    }
  }

  async function loadCities(provinceCode: string) {
    if (!provinceCode) {
      cities.value = []
      return
    }
    loadingCities.value = true
    try {
      // NCR is a region, not a province - use region endpoint
      const endpoint = provinceCode === NCR_CODE
        ? `${LOCATIONS_BASE}/cities?region=${provinceCode}`
        : `${LOCATIONS_BASE}/cities?province=${provinceCode}`
      const response = await $fetch<Array<{ code: string; name: string; provinceCode?: string; regionCode?: string; isCity: boolean }> | string>(endpoint)
      const data = typeof response === 'string' ? JSON.parse(response) : response
      if (data && Array.isArray(data)) {
        cities.value = data.map(c => ({
          code: c.code,
          name: c.name,
          provinceCode: c.provinceCode || c.regionCode || provinceCode,
          isCity: c.isCity
        })).sort((a, b) => a.name.localeCompare(b.name))
      }
    } catch (err) {
      console.error('Failed to load cities:', err)
      cities.value = []
    } finally {
      loadingCities.value = false
    }
  }

  async function loadBarangays(cityCode: string) {
    if (!cityCode) {
      barangays.value = []
      return
    }
    loadingBarangays.value = true
    try {
      const response = await $fetch<Array<{ code: string; name: string }> | string>(
        `${LOCATIONS_BASE}/barangays?city=${cityCode}`
      )
      const data = typeof response === 'string' ? JSON.parse(response) : response
      if (data && Array.isArray(data)) {
        barangays.value = data.map(b => ({
          code: b.code,
          name: b.name,
          cityCode
        })).sort((a, b) => a.name.localeCompare(b.name))
      }
    } catch (err) {
      console.error('Failed to load barangays:', err)
      barangays.value = []
    } finally {
      loadingBarangays.value = false
    }
  }

  // These return the in-flight load so callers can await the dependent list
  // before reading it. Without that, prefilling a saved location had to guess
  // with setTimeout, and a slow PSGC response left the selects empty — which
  // then let a plain Save overwrite the stored city/barangay with null.
  function selectProvince(code: string): Promise<void> {
    selectedProvince.value = code
    selectedCity.value = ''
    selectedBarangay.value = ''
    cities.value = []
    barangays.value = []
    return code ? loadCities(code) : Promise.resolve()
  }

  function selectCity(code: string): Promise<void> {
    selectedCity.value = code
    selectedBarangay.value = ''
    barangays.value = []
    return code ? loadBarangays(code) : Promise.resolve()
  }

  function selectBarangay(code: string) {
    selectedBarangay.value = code
  }

  function reset() {
    selectedProvince.value = ''
    selectedCity.value = ''
    selectedBarangay.value = ''
    cities.value = []
    barangays.value = []
  }

  return {
    provinces,
    cities,
    barangays,
    selectedProvince,
    selectedCity,
    selectedBarangay,
    provinceName,
    cityName,
    barangayName,
    loadingProvinces,
    loadingCities,
    loadingBarangays,
    loadProvinces,
    selectProvince,
    selectCity,
    selectBarangay,
    reset
  }
}
