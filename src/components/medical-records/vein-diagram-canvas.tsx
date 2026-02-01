'use client'

/**
 * Vein Diagram Canvas Component
 *
 * Canvas for drawing on a leg diagram to mark varicose vein locations.
 * Uses fabric.js for drawing with editable strokes.
 * Background image is shown via CSS, canvas is transparent.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Canvas, PencilBrush } from 'fabric'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Pencil,
  Eraser,
  MousePointer2,
  Trash2,
  RotateCcw,
  Download,
  Lock,
  Unlock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/** Available brush colors */
const COLORS = [
  { name: 'Rojo', value: '#ef4444' },
  { name: 'Azul', value: '#3b82f6' },
  { name: 'Verde', value: '#22c55e' },
  { name: 'Morado', value: '#a855f7' },
  { name: 'Naranja', value: '#f97316' },
  { name: 'Negro', value: '#000000' },
]

/** Tool modes */
type ToolMode = 'draw' | 'select' | 'erase'

interface VeinDiagramCanvasProps {
  /** Initial strokes data (JSON string from database) */
  initialData?: string | null
  /** Callback when strokes change */
  onChange?: (data: string) => void
  /** Whether the canvas is disabled */
  disabled?: boolean
  /** Canvas width */
  width?: number
  /** Canvas height */
  height?: number
}

/**
 * Canvas component for drawing vein locations on leg diagram
 */
export function VeinDiagramCanvas({
  initialData,
  onChange,
  disabled = false,
  width = 550,
  height = 700,
}: VeinDiagramCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<Canvas | null>(null)

  const [tool, setTool] = useState<ToolMode>('draw')
  const [color, setColor] = useState(COLORS[0].value)
  const [brushSize, setBrushSize] = useState(3)
  const [isReady, setIsReady] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current || fabricRef.current) return

    const canvas = new Canvas(canvasRef.current, {
      width,
      height,
      backgroundColor: 'transparent',
      isDrawingMode: false,
      selection: false,
    })

    // Set up pencil brush
    const brush = new PencilBrush(canvas)
    brush.color = color
    brush.width = brushSize
    canvas.freeDrawingBrush = brush

    fabricRef.current = canvas
    setIsReady(true)

    // Load initial data if provided
    if (initialData) {
      try {
        const objects = JSON.parse(initialData)
        if (Array.isArray(objects) && objects.length > 0) {
          // Use async loading for fabric.js v7
          canvas.loadFromJSON({ objects }).then(() => {
            canvas.renderAll()
            canvas.requestRenderAll()
            // Keep canvas locked after loading (user must click edit to enable)
          })
        }
      } catch (e) {
        console.error('Error loading initial canvas data:', e)
      }
    }

    // Handle object changes
    const handleChange = () => {
      if (!fabricRef.current || !onChange) return
      const objects = fabricRef.current.getObjects()
      const json = JSON.stringify(objects.map((obj) => obj.toJSON()))
      onChange(json)
    }

    canvas.on('path:created', handleChange)
    canvas.on('object:modified', handleChange)
    canvas.on('object:removed', handleChange)

    return () => {
      canvas.dispose()
      fabricRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update brush settings
  useEffect(() => {
    if (!fabricRef.current?.freeDrawingBrush) return

    fabricRef.current.freeDrawingBrush.color = color
    fabricRef.current.freeDrawingBrush.width = brushSize
  }, [color, brushSize])

  // Update editing mode - lock/unlock canvas
  useEffect(() => {
    if (!fabricRef.current) return

    if (!isEditing) {
      // Lock canvas
      fabricRef.current.isDrawingMode = false
      fabricRef.current.selection = false
      fabricRef.current.discardActiveObject()
      fabricRef.current.renderAll()
    } else {
      // Apply current tool mode when editing is enabled
      switch (tool) {
        case 'draw':
          fabricRef.current.isDrawingMode = true
          fabricRef.current.selection = false
          break
        case 'select':
        case 'erase':
          fabricRef.current.isDrawingMode = false
          fabricRef.current.selection = true
          break
      }
    }
  }, [isEditing, tool])

  // Auto-delete on selection in erase mode (fixes tablet touch)
  useEffect(() => {
    if (!fabricRef.current) return

    const canvas = fabricRef.current

    const handleSelection = () => {
      if (tool !== 'erase' || !isEditing) return

      const activeObject = canvas.getActiveObject()
      if (activeObject) {
        canvas.remove(activeObject)
        canvas.discardActiveObject()
        canvas.renderAll()

        if (onChange) {
          const objects = canvas.getObjects()
          const json = JSON.stringify(objects.map((obj) => obj.toJSON()))
          onChange(json)
        }
      }
    }

    canvas.on('selection:created', handleSelection)
    canvas.on('selection:updated', handleSelection)

    return () => {
      canvas.off('selection:created', handleSelection)
      canvas.off('selection:updated', handleSelection)
    }
  }, [tool, isEditing, onChange])

  // Handle delete selected object (for erase mode)
  const handleCanvasClick = useCallback(() => {
    if (tool !== 'erase' || !fabricRef.current) return

    const activeObject = fabricRef.current.getActiveObject()
    if (activeObject) {
      fabricRef.current.remove(activeObject)
      fabricRef.current.discardActiveObject()
      fabricRef.current.renderAll()

      if (onChange) {
        const objects = fabricRef.current.getObjects()
        const json = JSON.stringify(objects.map((obj) => obj.toJSON()))
        onChange(json)
      }
    }
  }, [tool, onChange])

  // Delete selected object
  const deleteSelected = useCallback(() => {
    if (!fabricRef.current) return

    const activeObject = fabricRef.current.getActiveObject()
    if (activeObject) {
      fabricRef.current.remove(activeObject)
      fabricRef.current.discardActiveObject()
      fabricRef.current.renderAll()

      if (onChange) {
        const objects = fabricRef.current.getObjects()
        const json = JSON.stringify(objects.map((obj) => obj.toJSON()))
        onChange(json)
      }
    }
  }, [onChange])

  // Clear all strokes
  const clearAll = useCallback(() => {
    if (!fabricRef.current) return

    const objects = fabricRef.current.getObjects()
    objects.forEach((obj) => fabricRef.current?.remove(obj))
    fabricRef.current.renderAll()

    if (onChange) {
      onChange('[]')
    }
  }, [onChange])

  // Export as image (includes background)
  const exportImage = useCallback(() => {
    if (!fabricRef.current || !canvasRef.current) return

    // Create a temporary canvas to merge background and drawings
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = width
    tempCanvas.height = height
    const ctx = tempCanvas.getContext('2d')
    if (!ctx) return

    // Draw white background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    // Draw background image
    const bgImg = new Image()
    bgImg.crossOrigin = 'anonymous'
    bgImg.onload = () => {
      // Calculate centered position
      const scale = Math.min(width / bgImg.width, height / bgImg.height)
      const scaledWidth = bgImg.width * scale
      const scaledHeight = bgImg.height * scale
      const x = (width - scaledWidth) / 2
      const y = (height - scaledHeight) / 2

      ctx.drawImage(bgImg, x, y, scaledWidth, scaledHeight)

      // Draw fabric canvas on top
      const fabricCanvas = canvasRef.current
      if (fabricCanvas) {
        ctx.drawImage(fabricCanvas, 0, 0)
      }

      // Download
      const link = document.createElement('a')
      link.download = 'diagrama-venas.png'
      link.href = tempCanvas.toDataURL('image/png')
      link.click()
    }
    bgImg.src = '/images/legs-diagram.jpg'
  }, [width, height])

  return (
    <div className={cn('space-y-4', disabled && 'opacity-50 pointer-events-none')}>
      {/* Edit toggle button */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant={isEditing ? 'default' : 'outline'}
          size="sm"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? (
            <>
              <Unlock className="h-4 w-4 mr-2" />
              Editando - Clic para bloquear
            </>
          ) : (
            <>
              <Lock className="h-4 w-4 mr-2" />
              Bloqueado - Clic para editar
            </>
          )}
        </Button>
        {!isEditing && (
          <span className="text-sm text-muted-foreground">
            Toque el boton para habilitar la edicion del diagrama
          </span>
        )}
      </div>

      {/* Toolbar - only visible when editing */}
      {isEditing && (
        <div className="flex flex-wrap items-center gap-4 p-3 bg-muted rounded-lg">
          {/* Tool selection */}
          <div className="flex gap-1">
            <Button
              type="button"
              variant={tool === 'draw' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTool('draw')}
              title="Dibujar"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={tool === 'select' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTool('select')}
              title="Seleccionar"
            >
              <MousePointer2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={tool === 'erase' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTool('erase')}
              title="Borrar trazo"
            >
              <Eraser className="h-4 w-4" />
            </Button>
          </div>

          {/* Color selection */}
          <div className="flex items-center gap-2">
            <Label className="text-sm">Color:</Label>
            <div className="flex gap-1">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={cn(
                    'w-6 h-6 rounded-full border-2 transition-transform',
                    color === c.value ? 'border-foreground scale-110' : 'border-transparent'
                  )}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          {/* Brush size */}
          <div className="flex items-center gap-2 min-w-32">
            <Label className="text-sm">Grosor:</Label>
            <Slider
              value={[brushSize]}
              onValueChange={([value]: number[]) => setBrushSize(value)}
              min={1}
              max={10}
              step={1}
              className="w-20"
            />
            <span className="text-sm w-4">{brushSize}</span>
          </div>

          {/* Actions */}
          <div className="flex gap-1 ml-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={deleteSelected}
              title="Eliminar seleccion"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearAll}
              title="Limpiar todo"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportImage}
              title="Descargar imagen"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Canvas with background image */}
      <div
        className="border rounded-lg overflow-hidden relative"
        style={{
          width,
          height,
          backgroundImage: 'url(/images/legs-diagram.jpg)',
          backgroundSize: 'auto 88%',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#ffffff',
        }}
        onClick={handleCanvasClick}
      >
        {!isReady && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-muted/80"
          >
            <span className="text-muted-foreground">Cargando...</span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
        />
      </div>

      {/* Instructions */}
      {isEditing && (
        <p className="text-sm text-muted-foreground">
          {tool === 'draw' && 'Dibuje sobre el diagrama para marcar las zonas afectadas'}
          {tool === 'select' && 'Toque un trazo para seleccionarlo y moverlo'}
          {tool === 'erase' && 'Toque un trazo para eliminarlo'}
        </p>
      )}
    </div>
  )
}
