import { useLocalSearchParams } from "expo-router"
import { ServiceDetail } from "@/components/services/ServiceDetail"
import { useTrackView } from "@/lib/view-tracker"

export default function MovingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  useTrackView("moving_posts", id)
  return <ServiceDetail kind="moving" id={id ?? ""} />
}
