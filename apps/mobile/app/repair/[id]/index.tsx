import { useLocalSearchParams } from "expo-router"
import { ServiceDetail } from "@/components/services/ServiceDetail"
import { useTrackView } from "@/lib/view-tracker"

export default function RepairDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  useTrackView("repair_posts", id)
  return <ServiceDetail kind="repair" id={id ?? ""} />
}
