export interface ValidationError {
  field: string
  message: string
}

export function validateMessage(input: { content?: string | null; imageUrl?: string | null }): ValidationError[] {
  const errors: ValidationError[] = []
  const hasContent = input.content && input.content.trim().length > 0
  const hasImage = !!input.imageUrl
  if (!hasContent && !hasImage) {
    errors.push({ field: 'content', message: '메시지를 입력해주세요' })
  }
  if (hasContent && input.content!.length > 5000) {
    errors.push({ field: 'content', message: '메시지는 5000자 이내' })
  }
  return errors
}
