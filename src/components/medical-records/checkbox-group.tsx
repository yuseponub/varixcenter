'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'

interface CheckboxOption {
  key: string
  label: string
}

interface CheckboxGroupProps {
  options: CheckboxOption[]
  values: Record<string, boolean>
  onChange: (key: string, checked: boolean) => void
  disabled?: boolean
  columns?: 2 | 3 | 4
  showOtros?: boolean
  otrosValue?: string
  onOtrosChange?: (value: string) => void
  otrosLabel?: string
  showTextField?: boolean
  textFieldKey?: string
  textFieldLabel?: string
  textFieldValue?: string
  onTextFieldChange?: (value: string) => void
}

/**
 * Reusable checkbox group component for medical record sections
 * Supports optional "otros" field and additional text field
 */
export function CheckboxGroup({
  options,
  values,
  onChange,
  disabled = false,
  columns = 2,
  showOtros = false,
  otrosValue = '',
  onOtrosChange,
  otrosLabel = 'Otros',
  showTextField = false,
  textFieldKey,
  textFieldLabel,
  textFieldValue = '',
  onTextFieldChange,
}: CheckboxGroupProps) {
  const gridCols = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  }

  return (
    <div className="space-y-4">
      <div className={`grid ${gridCols[columns]} gap-3`}>
        {options.map((option) => (
          <div key={option.key} className="flex items-center space-x-2">
            <Checkbox
              id={option.key}
              checked={values[option.key] || false}
              onCheckedChange={(checked) => onChange(option.key, checked === true)}
              disabled={disabled}
            />
            <Label
              htmlFor={option.key}
              className="text-sm font-normal cursor-pointer"
            >
              {option.label}
            </Label>
          </div>
        ))}
      </div>

      {showOtros && (
        <div className="space-y-2">
          <Label htmlFor="otros" className="text-sm">
            {otrosLabel}
          </Label>
          <Input
            id="otros"
            value={otrosValue}
            onChange={(e) => onOtrosChange?.(e.target.value)}
            placeholder="Especifique..."
            disabled={disabled}
            className="max-w-md"
          />
        </div>
      )}

      {showTextField && textFieldKey && (
        <div className="space-y-2">
          <Label htmlFor={textFieldKey} className="text-sm">
            {textFieldLabel}
          </Label>
          <Textarea
            id={textFieldKey}
            value={textFieldValue}
            onChange={(e) => onTextFieldChange?.(e.target.value)}
            placeholder="Escriba aqui..."
            disabled={disabled}
            rows={3}
          />
        </div>
      )}
    </div>
  )
}
