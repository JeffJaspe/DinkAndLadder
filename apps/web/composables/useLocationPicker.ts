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

const PSGC_BASE = 'https://psgc.gitlab.io/api'

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
      const data = await $fetch<Array<{ code: string; name: string; regionCode: string }>>(
        `${PSGC_BASE}/provinces/`
      )
      provinces.value = data.map(p => ({
        code: p.code,
        name: p.name,
        regionCode: p.regionCode
      })).sort((a, b) => a.name.localeCompare(b.name))
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
      const data = await $fetch<Array<{ code: string; name: string; provinceCode: string; isCity: boolean }>>(
        `${PSGC_BASE}/provinces/${provinceCode}/cities-municipalities/`
      )
      cities.value = data.map(c => ({
        code: c.code,
        name: c.name,
        provinceCode: c.provinceCode,
        isCity: c.isCity
      })).sort((a, b) => a.name.localeCompare(b.name))
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
      const data = await $fetch<Array<{ code: string; name: string }>>(
        `${PSGC_BASE}/cities-municipalities/${cityCode}/barangays/`
      )
      barangays.value = data.map(b => ({
        code: b.code,
        name: b.name,
        cityCode
      })).sort((a, b) => a.name.localeCompare(b.name))
    } catch (err) {
      console.error('Failed to load barangays:', err)
      barangays.value = []
    } finally {
      loadingBarangays.value = false
    }
  }

  function selectProvince(code: string) {
    selectedProvince.value = code
    selectedCity.value = ''
    selectedBarangay.value = ''
    cities.value = []
    barangays.value = []
    if (code) loadCities(code)
  }

  function selectCity(code: string) {
    selectedCity.value = code
    selectedBarangay.value = ''
    barangays.value = []
    if (code) loadBarangays(code)
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
