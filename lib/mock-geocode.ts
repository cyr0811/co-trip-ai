export interface MockCoordinate {
  lat: number
  lng: number
  address?: string
}

const mockCoordinates: Record<string, MockCoordinate> = {
  '东京': { lat: 35.681236, lng: 139.767125, address: 'Tokyo, Japan' },
  '东京站': { lat: 35.681236, lng: 139.767125, address: 'Tokyo Station, Chiyoda City, Tokyo' },
  '东京机场': { lat: 35.549393, lng: 139.779839, address: 'Tokyo Haneda Airport' },
  '羽田机场': { lat: 35.549393, lng: 139.779839, address: 'Tokyo Haneda Airport' },
  '成田机场': { lat: 35.771987, lng: 140.39285, address: 'Narita International Airport' },
  '新宿': { lat: 35.689592, lng: 139.700413, address: 'Shinjuku, Tokyo' },
  '新宿站': { lat: 35.690921, lng: 139.700258, address: 'Shinjuku Station, Tokyo' },
  '新宿御苑': { lat: 35.685176, lng: 139.710052, address: 'Shinjuku Gyoen, Tokyo' },
  '浅草': { lat: 35.711944, lng: 139.794722, address: 'Asakusa, Taito City, Tokyo' },
  '浅草寺': { lat: 35.714765, lng: 139.796655, address: 'Senso-ji, Asakusa, Tokyo' },
  '仲见世通': { lat: 35.712877, lng: 139.79667, address: 'Nakamise-dori, Asakusa, Tokyo' },
  '上野': { lat: 35.713768, lng: 139.777254, address: 'Ueno, Tokyo' },
  '上野公园': { lat: 35.715596, lng: 139.77452, address: 'Ueno Park, Tokyo' },
  '东京国立博物馆': { lat: 35.718835, lng: 139.776521, address: 'Tokyo National Museum, Tokyo' },
  '原宿': { lat: 35.670168, lng: 139.702687, address: 'Harajuku, Tokyo' },
  '表参道': { lat: 35.665247, lng: 139.712314, address: 'Omotesando, Tokyo' },
  '涩谷': { lat: 35.658034, lng: 139.701636, address: 'Shibuya, Tokyo' },
  '涩谷 Sky': { lat: 35.65858, lng: 139.701635, address: 'Shibuya Sky, Tokyo' },
  '涩谷十字路口': { lat: 35.659482, lng: 139.700559, address: 'Shibuya Crossing, Tokyo' },
  '银座': { lat: 35.671989, lng: 139.763965, address: 'Ginza, Tokyo' },
  '筑地': { lat: 35.665486, lng: 139.770667, address: 'Tsukiji, Tokyo' },
  '东京塔': { lat: 35.658581, lng: 139.745433, address: 'Tokyo Tower, Tokyo' },
  '台场': { lat: 35.62671, lng: 139.77553, address: 'Odaiba, Tokyo' },
  '代官山': { lat: 35.648064, lng: 139.703064, address: 'Daikanyama, Tokyo' },
  '清澄白河': { lat: 35.682758, lng: 139.798014, address: 'Kiyosumi Shirakawa, Tokyo' },
  '迪士尼': { lat: 35.632896, lng: 139.880394, address: 'Tokyo Disney Resort, Chiba' },
  '东京迪士尼': { lat: 35.632896, lng: 139.880394, address: 'Tokyo Disney Resort, Chiba' },
  '成都': { lat: 30.659462, lng: 104.065735, address: 'Chengdu, Sichuan' },
  '太古里': { lat: 30.653927, lng: 104.081068, address: 'Taikoo Li Chengdu' },
  '春熙路': { lat: 30.656183, lng: 104.077623, address: 'Chunxi Road, Chengdu' },
  '宽窄巷子': { lat: 30.667617, lng: 104.052292, address: 'Kuanzhai Alley, Chengdu' },
  '人民公园': { lat: 30.659853, lng: 104.057048, address: "People's Park, Chengdu" },
  '武侯祠': { lat: 30.642179, lng: 104.047419, address: 'Wuhou Shrine, Chengdu' },
  '锦里': { lat: 30.643447, lng: 104.047726, address: 'Jinli, Chengdu' },
  '熊猫基地': { lat: 30.739026, lng: 104.145839, address: 'Chengdu Research Base of Giant Panda Breeding' },
  '杜甫草堂': { lat: 30.666822, lng: 104.028724, address: 'Du Fu Thatched Cottage, Chengdu' },
}

function normalizeName(value?: string) {
  return value?.replace(/\s+/g, '').toLowerCase() || ''
}

export function resolveMockCoordinate(name?: string, destination?: string): MockCoordinate | undefined {
  const normalizedName = normalizeName(name)
  const normalizedDestination = normalizeName(destination)
  const entries = Object.entries(mockCoordinates)

  const exact = entries.find(([key]) => normalizeName(key) === normalizedName)
  if (exact) return exact[1]

  const included = entries.find(([key]) => {
    const normalizedKey = normalizeName(key)
    return normalizedName.includes(normalizedKey) || normalizedKey.includes(normalizedName)
  })
  if (included) return included[1]

  const destinationFallback = entries.find(([key]) => normalizeName(key) === normalizedDestination)
  return destinationFallback?.[1]
}
