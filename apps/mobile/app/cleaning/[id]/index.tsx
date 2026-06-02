import { useLocalSearchParams } from "expo-router"
import { ServiceDetail } from "@/components/services/ServiceDetail"
import { useTrackView } from "@/lib/view-tracker"

export default function CleaningDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  useTrackView("cleaning_posts", id)
  return <ServiceDetail kind="cleaning" id={id ?? ""} />
}
