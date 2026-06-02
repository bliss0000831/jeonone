import { useLocalSearchParams } from "expo-router"
import { ServiceEdit } from "@/components/services/ServiceEdit"

export default function RepairEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <ServiceEdit kind="repair" id={id ?? ""} />
}
