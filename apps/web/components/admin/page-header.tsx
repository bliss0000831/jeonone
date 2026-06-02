import { ComponentType, ReactNode, isValidElement, createElement } from 'react'

interface Props {
  title: string
  description?: string
  icon?: ReactNode | ComponentType<{ className?: string }>
  actions?: ReactNode
  /** 배지 (예: "12건 대기중") */
  badge?: ReactNode
}

export function AdminPageHeader({ title, description, icon, actions, badge }: Props) {
  let renderedIcon: ReactNode = null
  if (icon) {
    if (isValidElement(icon)) {
      renderedIcon = icon
    } else if (
      typeof icon === 'function' ||
      (typeof icon === 'object' && icon !== null && 'render' in (icon as any))
    ) {
      renderedIcon = createElement(icon as ComponentType<{ className?: string }>, {
        className: 'w-5 h-5',
      })
    } else {
      renderedIcon = icon as ReactNode
    }
  }
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          {renderedIcon && (
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary">
              {renderedIcon}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              {badge}
            </div>
            {description && (
              <p className="text-[13px] text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
