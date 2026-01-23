# Prompts para v0.dev - VarixCenter

## Cómo usar v0.dev

1. Ir a https://v0.dev
2. Copiar el prompt de abajo
3. Generar el componente
4. Exportar a tu proyecto

---

## Prompts por Pantalla

### 1. Layout Principal (Dashboard)

```
Create a medical clinic dashboard layout with:
- Dark blue (#0e0142) sidebar on the left with navigation icons
- Gold (#ffe248) accent color for highlights
- Top header with clinic name "VarixCenter", user name dropdown, notifications bell, and logout button
- Main content area with a grid of 6 cards:
  1. Agenda (calendar icon) - shows "12 citas hoy"
  2. Pacientes (users icon) - has search input
  3. Historias (clipboard icon) - "Nueva historia" button
  4. Pagos (dollar icon) - "Registrar pago" button
  5. Caja (cash register icon) - shows "$2,450,000 hoy"
  6. Medias (sock icon) - shows "3 órdenes pendientes"
- Below the cards, a section "Próximas Citas" with a table showing: hora, paciente, tratamiento, and "Atender" button
- Use shadcn/ui components
- Make it responsive for tablets (iPad)
- Use Spanish labels
```

### 2. Agenda del Día

```
Create a daily appointment schedule view for a medical clinic with:
- Header with back arrow, title "Agenda - 23 Enero 2026", and "+ Nueva" button
- Date navigation: "< Anterior", "Hoy", "Siguiente >" buttons
- Doctor filter dropdown
- Table/list showing appointments:
  - Hora column (8:00, 8:30, 9:00, etc)
  - Paciente / Procedimiento column
  - Status indicator: pending (yellow), in-progress (blue), completed (green), cancelled (red)
- Each row is clickable
- Summary footer: "Atendidos: 15 | Cancelaron: 2 | Pendientes: 3 | Total: $2,450,000"
- Colors: primary #0e0142, accent #ffe248
- Use shadcn/ui components
- Spanish labels
- Tablet-optimized
```

### 3. Buscar Paciente

```
Create a patient search page for a medical clinic with:
- Header with back arrow and title "Pacientes", plus "+ Nuevo" button
- Large search input with placeholder "Buscar por cédula, nombre o teléfono..."
- Results list showing patient cards:
  - Cédula (ID number) in bold
  - Full name
  - Phone icon with number
  - "Última visita: DD/MM/YYYY"
  - Two buttons: "Ver" and clipboard icon for new history
- Empty state when no results
- Loading state while searching
- Colors: primary #0e0142, accent #ffe248
- Use shadcn/ui components
- Spanish labels
```

### 4. Formulario Historia Clínica

```
Create a medical history form for a phlebology clinic (varicose veins) with:
- Header: back arrow, "Historia Clínica - [Patient Name]", "Guardar" button
- Sections with collapsible cards:

1. DATOS DEL PACIENTE (read-only)
   - Cédula, Edad, Dirección in a grid

2. SÍNTOMAS (checkboxes in 3 columns)
   - Dolor, Cansancio, Edema, Calambres, Prurito, Úlcera, Ardor, Adormecimiento
   - Input: "Tiempo de evolución" (text)

3. INICIO RELACIONADO (checkboxes)
   - Adolescencia, Embarazo, Planificación, Trauma, Posquirúrgico

4. ANTECEDENTES
   - Familiares (text input)
   - Ginecología (text input), Planifica (select Yes/No)
   - Enfermedades (text)
   - Alergias (text)
   - Cirugías previas (text)

5. DIAGNÓSTICO (large textarea)
   - Button: "🎤 Iniciar dictado" (for voice input feature)

- Colors: primary #0e0142, accent #ffe248
- Use shadcn/ui components
- Spanish labels
- Tablet-optimized with large touch targets
```

### 5. Registrar Pago

```
Create a payment registration form for a medical clinic with:
- Header: back arrow, "Registrar Pago", "Guardar" button
- Patient search/select field (autocomplete)
- Selected patient card showing name and ID

- Service selection section:
  - Radio buttons for services:
    - Valoración $100,000
    - Control $110,000
    - Scaneo $95,000
    - Sesiones escleroterapia $95,000 (with quantity input)
    - ECOR (with price input)
    - Otro (with description and price inputs)
  - Auto-calculated TOTAL display (large, bold)

- Payment method selection:
  - Radio buttons: Efectivo, Tarjeta, Transferencia, Nequi

- Photo capture section:
  - Label: "Foto del recibo (obligatorio)"
  - Camera button to take photo
  - Preview of captured photo
  - Required indicator

- Large "REGISTRAR PAGO" button at bottom

- Format prices as Colombian pesos (e.g., $190.000)
- Colors: primary #0e0142, accent #ffe248
- Use shadcn/ui components
- Spanish labels
```

### 6. Cierre de Caja

```
Create a daily cash register closing page for a medical clinic with:
- Header: back arrow, "Cierre de Caja - 23 Enero 2026", "Cerrar" button

- System Summary Card:
  - Efectivo: $1,615,000
  - Tarjeta: $5,165,000
  - Transferencia: $2,645,000
  - Nequi: $0
  - Divider line
  - TOTAL: $9,425,000 (bold, large)

- Physical Cash Input:
  - Label: "Efectivo contado:"
  - Money input field
  - Difference display: "$0 ✓ CUADRA" (green) or "-$50,000 ✗ FALTANTE" (red)

- Photo capture for cash:
  - Camera button
  - Preview

- Payments detail table:
  - Columns: Factura #, Paciente, Concepto, Valor, Método
  - Scrollable list

- Large "CERRAR CAJA" button (disabled if difference ≠ 0 or no photo)

- Format as Colombian pesos
- Colors: primary #0e0142, accent #ffe248
- Use shadcn/ui components
- Spanish labels
```

### 7. Cotización/Plan de Tratamiento (Print Template)

```
Create a printable treatment plan/quote document for a phlebology clinic with:
- Clinic header:
  - Logo placeholder
  - "VARIX CENTER - CENTRO MÉDICO FLEBOLÓGICO"
  - Address: "CRA. 34 N° 52-125 Piso 2"
  - Phone: "Tel: 6436810 - 3162814531"

- Patient info row:
  - FECHA, PACIENTE, MÉDICO, CÉDULA

- Diagnosis section:
  - Title: "DIAGNÓSTICO"
  - Bullet points for conditions

- Treatment plan table:
  - Columns: Descripción, Pierna, Valor
  - Rows for ECOR procedures
  - Subtotal for procedures

- Sclerotherapy section:
  - "X sesiones aproximadas x $95,000 = $X"

- Total box:
  - "TOTAL ESTIMADO: $X,XXX,XXX" (highlighted)

- Recommended supplies:
  - "Medias de compresión 20-30 mmHg"

- Footer:
  - "Este plan tiene validez de 6 meses"
  - Doctor signature line

- A4 paper size, clean print layout
- Colors: minimal, professional
- Spanish text
```

### 8. Login Page

```
Create a login page for a medical clinic system with:
- Centered card on a light gray background
- Clinic logo placeholder at top
- Title: "VarixCenter"
- Subtitle: "Sistema de Gestión Clínica"
- Email input field
- Password input field with show/hide toggle
- "Ingresar" button (full width, primary color)
- Colors: primary #0e0142, accent #ffe248
- Use shadcn/ui components
- Spanish labels
- Tablet and mobile friendly
```

---

## Componentes Individuales

### Tarjeta de Paciente

```
Create a patient card component with:
- ID number (cédula) in bold at top
- Full name below
- Phone icon with number
- "Última visita: DD/MM/YYYY" in gray text
- Two action buttons on the right: "Ver" (outline) and clipboard icon (for new history)
- Hover effect
- Use shadcn/ui Card component
- Spanish labels
```

### Selector de Método de Pago

```
Create a payment method selector with 4 options in a horizontal row:
- Efectivo (cash icon)
- Tarjeta (credit card icon)
- Transferencia (bank icon)
- Nequi (phone icon)
- Radio button style, only one selectable
- Selected state: #0e0142 background with #ffe248 icon
- Use shadcn/ui RadioGroup
```

### Captura de Foto

```
Create a photo capture component for mobile/tablet with:
- Dashed border container
- Camera icon in center
- "Tomar foto" button
- After capture: shows preview thumbnail with "X" to remove
- Required indicator option
- Use shadcn/ui
- Spanish labels
```

### Badge de Estado de Cita

```
Create appointment status badges:
- Pendiente: yellow background, dark text
- En atención: blue background, white text
- Atendido: green background, white text
- Cancelado: red background, white text
- No asistió: gray background, dark text
- Small, rounded pill shape
- Spanish labels
```

---

## Integración con el Proyecto

Después de generar en v0:

1. Click "Add to Codebase" en v0
2. Selecciona el repositorio `varix-clinic`
3. v0 creará un PR con los componentes
4. Review y merge el PR

O manualmente:
1. Click "Copy Code" en v0
2. Pega en el archivo correspondiente en `/components/`
