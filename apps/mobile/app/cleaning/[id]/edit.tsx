import { useLocalSearchParams } from "expo-router"
import { ServiceEdit } from "@/components/services/ServiceEdit"

export default function CleaningEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <ServiceEdit kind="cleaning" id={id ?? ""} />
}
