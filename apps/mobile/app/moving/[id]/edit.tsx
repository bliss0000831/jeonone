import { useLocalSearchParams } from "expo-router"
import { ServiceEdit } from "@/components/services/ServiceEdit"

export default function MovingEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <ServiceEdit kind="moving" id={id ?? ""} />
}
