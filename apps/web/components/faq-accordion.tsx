'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FaqItem {
  id: string
  question: string
  answer: string
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      {items.map((faq) => (
        <div key={faq.id} className="bg-card rounded-xl border border-border overflow-hidden">
          <button
            onClick={() => setOpenId(openId === faq.id ? null : faq.id)}
            aria-expanded={openId === faq.id}
            aria-controls={`faq-panel-${faq.id}`}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <span className="font-medium text-foreground pr-4">{faq.question}</span>
            <ChevronDown
              className={cn(
                'w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform',
                openId === faq.id && 'rotate-180',
              )}
            />
          </button>
          {openId === faq.id && (
            <div id={`faq-panel-${faq.id}`} role="region" className="px-4 pb-4">
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {faq.answer}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
