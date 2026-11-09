// Files the simulated owner hands over when the builder asks for an upload,
// made on the fly so no binaries live in the repo.
import * as XLSX from 'xlsx';

export const MENU = [
  [
    'Entradas',
    [
      ['Pan de ajo', 9000],
      ['Bruschetta de tomate', 14000],
      ['Sopa minestrone', 16000]
    ]
  ],
  [
    'Pastas',
    [
      ['Lasaña de carne', 32000],
      ['Lasaña vegetariana', 30000],
      ['Spaghetti carbonara', 29000],
      ['Fettuccine Alfredo', 28000]
    ]
  ],
  [
    'Pizzas',
    [
      ['Margherita', 32000],
      ['Pepperoni', 36000],
      ['Hawaiana', 35000],
      ['Cuatro quesos', 38000]
    ]
  ],
  [
    'Postres',
    [
      ['Tiramisú', 15000],
      ['Panna cotta', 13000]
    ]
  ],
  [
    'Bebidas',
    [
      ['Limonada de coco', 9000],
      ['Gaseosa', 5000],
      ['Copa de vino tinto', 18000]
    ]
  ]
];

const money = n => '$' + n.toLocaleString('es-CO').replace(/,/g, '.');

// A one-page PDF with real text (Helvetica, WinAnsi), so text extraction
// reads it the way it reads a menu exported from Word.
export const menuPdf = () => {
  const lines = [
    ['Trattoria Nonna Lucia', 20],
    ['Menú · Bogotá, Chapinero', 11],
    ['', 8]
  ];
  for (const [section, items] of MENU) {
    lines.push([section, 14]);
    for (const [name, price] of items)
      lines.push([`${name} ........ ${money(price)}`, 11]);
    lines.push(['', 6]);
  }
  lines.push(['Domicilios de 12 m a 9 pm. Pedidos por WhatsApp.', 10]);

  const esc = s =>
    s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  let y = 790;
  const ops = ['BT'];
  for (const [text, size] of lines) {
    y -= size + 8;
    if (text) ops.push(`/F1 ${size} Tf 1 0 0 1 60 ${y} Tm (${esc(text)}) Tj`);
  }
  ops.push('ET');
  const stream = Buffer.from(ops.join('\n'), 'latin1');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  ];
  const parts = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [];
  let length = parts[0].length;
  objects.forEach((body, i) => {
    offsets.push(length);
    const chunk =
      body === null
        ? Buffer.concat([
            Buffer.from(
              `${i + 1} 0 obj\n<< /Length ${stream.length} >>\nstream\n`,
              'latin1'
            ),
            stream,
            Buffer.from('\nendstream\nendobj\n', 'latin1')
          ])
        : Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, 'latin1');
    parts.push(chunk);
    length += chunk.length;
  });
  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts);
};

export const CLIENTS = [
  ['Laura Méndez', '+573004445566', 'Bogotá', 'sí'],
  ['Carlos Ruiz', '+573101234567', 'Medellín', 'no'],
  ['Ana Gómez', '+573001112233', 'Bogotá', 'sí'],
  ['Jorge Pérez', '+573152223344', 'Cali', 'no'],
  ['Marta Salazar', '+573203334455', 'Bogotá', 'no'],
  ['Felipe Ortiz', '+573014445566', 'Barranquilla', 'sí'],
  ['Diana Rojas', '+573125556677', 'Bogotá', 'no'],
  ['Andrés Castro', '+573186667788', 'Bucaramanga', 'no'],
  ['Valentina López', '+573017778899', 'Medellín', 'sí'],
  ['Santiago Herrera', '+573138889900', 'Bogotá', 'no'],
  ['Camila Torres', '+573209990011', 'Pereira', 'no'],
  ['Julián Vargas', '+573040001122', 'Bogotá', 'sí']
];

export const clientsXlsx = () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Nombre', 'Teléfono', 'Ciudad', 'Cliente frecuente'],
    ...CLIENTS
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Clientes');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
};

export const FILES = {
  'menu.pdf': { bytes: menuPdf, contentType: 'application/pdf' },
  'clientes.xlsx': {
    bytes: clientsXlsx,
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
};
