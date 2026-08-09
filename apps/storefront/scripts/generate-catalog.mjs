// Generates apps/storefront/data/products.json - a 200-item catalog of
// fictional-brand products across the 10 real category slugs already used by
// CategoryGrid/ProductGrid. Deterministic (no RNG) so re-running produces the
// same file; edit the tables below and re-run to change the catalog.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "data", "products.json");

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const STYLE_BASE =
  "professional studio product photography, seamless light grey backdrop, soft diffused key light from upper left, subtle contact shadow, 50mm lens, product centered filling 80% of frame, square 1:1, ultra sharp, commercial e-commerce catalog style, no text, no logo, no watermark, no people";

const CATEGORY_STYLE_EXTRA = {
  "mobile-accessories": ", on reflective white acrylic surface, soft reflection under product",
  smartphones: ", screens off or showing neutral dark gradient, no interface graphics",
  furniture: ", minimal neutral room context, plain wall, natural side light",
  laptops: ", screens off or showing neutral dark gradient, no interface graphics",
  "home-decoration": ", minimal neutral room context, plain wall, natural side light",
  tablets: ", screens off or showing neutral dark gradient, no interface graphics",
  "mens-watches": ", macro shot, dark grey gradient backdrop, specular highlights on metal",
  "womens-watches": ", macro shot, dark grey gradient backdrop, specular highlights on metal",
  "sports-accessories": ", light concrete grey backdrop, dynamic slight angle",
  sunglasses: ", three-quarter angle view, floating with soft shadow"
};

const GALLERY_ANGLES = [
  ", three-quarter angle view",
  ", close-up detail shot of texture and finish",
  ", top-down flat lay view"
];

// --- Subcategory tables -----------------------------------------------
// Each entry: { key, label, brand, code, priceMin, priceMax, lines: [productLineName,...],
//   colors: [...], specs: (line, price) => ({...}), tags: [...], descBody: (line) => string }

let ratingCursor = 0;
function correlatedRating() {
  // Cycles through a fixed, realistic spread instead of random - still varied,
  // still deterministic, and rating/reviewCount stay correlated (see below).
  const spread = [3.4, 3.6, 3.8, 3.9, 4.0, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.5, 4.2, 3.7, 4.0, 4.6, 4.3];
  const value = spread[ratingCursor % spread.length];
  ratingCursor += 1;
  return value;
}
function reviewCountFor(rating) {
  // Higher rating -> tends toward more reviews, but not a straight line.
  const base = Math.round((rating - 3.2) * 220);
  const jitter = ((ratingCursor * 37) % 90) - 20;
  return Math.max(3, Math.min(900, base + jitter));
}

let stockCursor = 0;
function stockFor() {
  stockCursor += 1;
  if (stockCursor % 19 === 0) return 0; // ~5%
  if (stockCursor % 9 === 0) return [2, 3, 4, 5, 6, 7][stockCursor % 6]; // low stock
  return 8 + ((stockCursor * 53) % 173); // 8-180
}

function priceIn(min, max, i, n) {
  // Spread deterministically across the range instead of random, then round
  // to a realistic retail ending (…9 for sub-100, …99 or round elsewhere).
  const t = n <= 1 ? 0 : i / (n - 1);
  const raw = min + t * (max - min);
  if (raw < 60) return Math.round(raw) - (Math.round(raw) % 5) + 9;
  if (raw < 300) return Math.floor(raw / 10) * 10 - 1;
  return Math.round(raw / 5) * 5;
}

const CATEGORIES = [
  {
    slug: "mobile-accessories",
    code: "MOB",
    subcats: [
      {
        key: "fundas",
        code: "FUND",
        brand: "Halven",
        count: 7,
        priceMin: 12,
        priceMax: 45,
        lines: [
          "Funda Slim Grip",
          "Funda Guard Fold",
          "Funda Clear Edge",
          "Funda Rugged Shield",
          "Funda Wallet Snap",
          "Funda Soft Touch",
          "Funda Kickstand Pro"
        ],
        colors: ["Negro", "Grafito", "Arena", "Verde musgo", "Azul noche"],
        tags: ["funda", "proteccion", "accesorio-celular"],
        specsFn: () => ({
          Material: "Policarbonato con borde de TPU",
          Compatibilidad: "Modelos de pantalla 6.1\"-6.7\"",
          Proteccion: "Caida certificada 1.8 m",
          Peso: "32 g"
        }),
        descBody: (line) =>
          `Cubre los bordes y las cámaras sin añadir bulto notable al bolsillo. El acabado ${line.includes("Soft") ? "suave al tacto" : "texturizado"} evita que el equipo resbale sobre superficies lisas.`
      },
      {
        key: "cargadores",
        code: "CARG",
        brand: "Velst",
        count: 6,
        priceMin: 18,
        priceMax: 55,
        lines: ["Cargador GaN 30W", "Cargador Dual USB-C 45W", "Cargador Inalámbrico 15W", "Cargador de Auto 20W", "Cargador GaN 65W", "Cargador Inalámbrico Stand 10W"],
        colors: ["Blanco", "Negro"],
        tags: ["cargador", "carga-rapida", "accesorio-celular"],
        specsFn: () => ({
          Potencia: "Ver nombre del modelo",
          Entrada: "100-240V",
          Proteccion: "Sobrecarga y sobretemperatura",
          Certificacion: "USB-IF"
        }),
        descBody: () =>
          "Entrega carga rápida estable sin recalentarse en sesiones largas. El circuito integrado ajusta la potencia según el dispositivo conectado para proteger la batería a largo plazo."
      },
      {
        key: "cables",
        code: "CABL",
        brand: "Ampera",
        count: 5,
        priceMin: 9,
        priceMax: 28,
        lines: ["Cable Trenzado USB-C a USB-C", "Cable Trenzado USB-C a Lightning", "Cable Reforzado USB-A a USB-C", "Cable Retráctil de Viaje", "Cable Angulado para Gaming"],
        colors: ["Negro", "Blanco", "Rojo"],
        tags: ["cable", "accesorio-celular", "carga"],
        specsFn: () => ({
          Longitud: "1.8 m",
          Recubrimiento: "Nylon trenzado",
          "Ciclos de flexion": "12,000+",
          Transferencia: "Datos y carga"
        }),
        descBody: () =>
          "El trenzado de nylon resiste nudos y dobleces sin desgastarse en el punto de conexión, el punto donde la mayoría de cables comunes fallan primero."
      },
      {
        key: "powerbanks",
        code: "POWB",
        brand: "Velst",
        count: 5,
        priceMin: 22,
        priceMax: 69,
        lines: ["Power Bank 10000mAh", "Power Bank 20000mAh", "Power Bank Slim 5000mAh", "Power Bank Solar 15000mAh", "Power Bank MagSafe 5000mAh"],
        colors: ["Negro", "Gris piedra"],
        tags: ["powerbank", "bateria-portatil", "viaje"],
        specsFn: () => ({
          Capacidad: "Ver nombre del modelo",
          Puertos: "USB-C + USB-A",
          "Carga entrante": "18W",
          Peso: "180-420 g segun capacidad"
        }),
        descBody: () =>
          "Suficiente para varias cargas completas fuera de casa. El indicador LED muestra el porcentaje restante sin necesidad de conectar el celular para revisarlo."
      },
      {
        key: "soportes",
        code: "SOPO",
        brand: "Halven",
        count: 5,
        priceMin: 14,
        priceMax: 38,
        lines: ["Soporte Plegable de Escritorio", "Soporte Magnético para Auto", "Soporte Ajustable para Videollamadas", "Soporte de Anillo Giratorio", "Soporte para Bicicleta"],
        colors: ["Negro", "Plata"],
        tags: ["soporte", "accesorio-celular", "escritorio"],
        specsFn: () => ({
          Material: "Aluminio anodizado",
          Angulo: "Ajustable multi-posicion",
          Compatibilidad: "Celulares y tablets pequeñas",
          Plegado: "Si"
        }),
        descBody: (line) => `${line} se pliega en segundos para guardarlo sin ocupar espacio en el bolso, y sostiene el equipo firme incluso al escribir sobre la pantalla.`
      },
      {
        key: "audifonos",
        code: "AUDI",
        brand: "Nova Audio",
        count: 5,
        priceMin: 25,
        priceMax: 95,
        lines: ["Audífonos con Cable Studio Fit", "Audífonos In-Ear Monitor", "Audífonos Over-Ear Bass Line", "Audífonos con Cable Sport Loop", "Audífonos con Micrófono Boom"],
        colors: ["Negro", "Azul medianoche"],
        tags: ["audifonos", "audio", "con-cable"],
        specsFn: () => ({
          Conector: "3.5mm / USB-C",
          Driver: "10mm dinámico",
          Cable: "1.2 m trenzado",
          Microfono: "Integrado con control en linea"
        }),
        descBody: () => "El driver dinámico entrega graves presentes sin invadir las voces, y el conector reforzado evita el punto de falla típico de los audífonos con cable."
      }
    ]
  },
  {
    slug: "smartphones",
    code: "SMP",
    subcats: [
      {
        key: "flagship",
        code: "FLAG",
        brand: "Arion",
        count: 6,
        priceMin: 799,
        priceMax: 1299,
        lines: ["Arion Zenith 5", "Arion Zenith 5 Pro", "Arion Vertex X", "Arion Vertex X Max", "Arion Halo 3", "Arion Halo 3 Ultra"],
        colors: ["Negro obsidiana", "Titanio", "Azul profundo"],
        tags: ["smartphone", "flagship", "camara-triple"],
        specsFn: () => ({
          Pantalla: "6.7\" AMOLED 120Hz",
          Procesador: "Octa-core de ultima generacion",
          Camara: "Triple sensor 50MP",
          Bateria: "5000 mAh, carga 45W",
          RAM: "12 GB"
        }),
        descBody: (line) => `${line} apunta a quien usa el celular como herramienta de trabajo y cámara principal, no solo como accesorio. El chip mantiene fluidez incluso con varias apps pesadas abiertas a la vez.`
      },
      {
        key: "media",
        code: "MEDI",
        brand: "Arion",
        count: 5,
        priceMin: 349,
        priceMax: 599,
        lines: ["Arion Pulse 4", "Arion Pulse 4 Lite", "Arion Drift 2", "Arion Drift 2 Plus", "Arion Loop S"],
        colors: ["Negro", "Verde salvia", "Lavanda"],
        tags: ["smartphone", "gama-media", "buena-camara"],
        specsFn: () => ({
          Pantalla: "6.5\" AMOLED 90Hz",
          Procesador: "Octa-core eficiente",
          Camara: "Doble sensor 48MP",
          Bateria: "4800 mAh, carga 33W",
          RAM: "8 GB"
        }),
        descBody: () => "Cubre las tareas del día a día sin los precios de un flagship: fotos correctas con buena luz, batería que aguanta hasta la noche y una pantalla nítida para ver series en el bus."
      },
      {
        key: "mediaRyzel",
        code: "MEDI",
        brand: "Ryzel",
        count: 5,
        priceMin: 299,
        priceMax: 449,
        lines: ["Ryzel Aria 3", "Ryzel Aria 3 Pro", "Ryzel Nimbus 2", "Ryzel Flux", "Ryzel Flux SE"],
        colors: ["Gris grafito", "Blanco perla"],
        tags: ["smartphone", "gama-media", "bateria-larga"],
        specsFn: () => ({
          Pantalla: "6.4\" IPS 90Hz",
          Procesador: "Octa-core",
          Camara: "Doble sensor 50MP",
          Bateria: "5000 mAh, carga 25W",
          RAM: "8 GB"
        }),
        descBody: (line) => `${line} prioriza autonomía sobre cualquier otra cosa: con uso normal llega a dos días sin buscar el cargador.`
      },
      {
        key: "economicos",
        code: "ECON",
        brand: "Ovalta",
        count: 6,
        priceMin: 129,
        priceMax: 249,
        lines: ["Ovalta Go 2", "Ovalta Go 2 Plus", "Ovalta Mini", "Ovalta Basic 4", "Ovalta Basic 4 Pro", "Ovalta Youth"],
        colors: ["Negro", "Azul cielo", "Coral"],
        tags: ["smartphone", "economico", "entrada"],
        specsFn: () => ({
          Pantalla: "6.2\" IPS 60Hz",
          Procesador: "Quad-core",
          Camara: "Sensor unico 13MP",
          Bateria: "4500 mAh, carga 18W",
          RAM: "4 GB"
        }),
        descBody: () => "Sin lujos, pero cumple lo básico: llamadas, mensajería, redes sociales y navegación fluida para quien no quiere pagar de más por funciones que no va a usar."
      },
      {
        key: "plegables",
        code: "PLEG",
        brand: "Ryzel",
        count: 3,
        priceMin: 1399,
        priceMax: 1899,
        lines: ["Ryzel Fold Vertex", "Ryzel Fold Vertex Mini", "Ryzel Fold Vertex Duo"],
        colors: ["Negro obsidiana", "Crema"],
        tags: ["smartphone", "plegable", "premium"],
        specsFn: () => ({
          "Pantalla interna": "7.6\" AMOLED plegable",
          "Pantalla externa": "6.1\" AMOLED",
          Procesador: "Octa-core de ultima generacion",
          Bisagra: "Refuerzo de titanio",
          Bateria: "4700 mAh, carga 40W"
        }),
        descBody: (line) => `${line} pasa de teléfono a mini-tablet en un giro de muñeca, con una bisagra pensada para más de 200.000 pliegues sin holgura.`
      }
    ]
  },
  {
    slug: "furniture",
    code: "FUR",
    subcats: [
      {
        key: "sillas",
        code: "SILL",
        brand: "Driftwood & Co",
        count: 6,
        priceMin: 149,
        priceMax: 449,
        lines: ["Silla Ergonómica Meridian", "Silla Ergonómica Meridian Mesh", "Silla Gamer Vantage", "Silla de Malla Airflow", "Silla Ejecutiva Bexley", "Silla Ajustable Pivot"],
        colors: ["Negro", "Gris carbón"],
        tags: ["silla-oficina", "ergonomico", "escritorio"],
        specsFn: () => ({
          "Ajuste de altura": "Neumático, 12 cm de recorrido",
          Reposabrazos: "3D ajustables",
          "Soporte lumbar": "Integrado, ajustable",
          "Peso maximo": "130 kg",
          Base: "Aluminio con ruedas de nylon"
        }),
        descBody: () => "El soporte lumbar ajustable mantiene la espalda recta después de horas sentado, y la base de aluminio soporta el peso sin crujir con el tiempo."
      },
      {
        key: "escritorios",
        code: "ESCR",
        brand: "Driftwood & Co",
        count: 6,
        priceMin: 129,
        priceMax: 599,
        lines: ["Escritorio Elevable Standing", "Escritorio Elevable Standing L", "Escritorio Minimalista Oak", "Escritorio en L Corner", "Escritorio Compacto Nook", "Escritorio Elevable Dual Motor"],
        colors: ["Roble natural", "Blanco", "Nogal oscuro"],
        tags: ["escritorio", "home-office", "muebles"],
        specsFn: () => ({
          "Superficie": "MDF laminado resistente a rayones",
          "Rango de altura": "70-120 cm",
          "Capacidad de carga": "70 kg",
          Motor: "Silencioso, memoria de posiciones"
        }),
        descBody: (line) => `${line} alterna entre sentado y de pie sin ruido de motor que interrumpa una llamada, con memoria para guardar la altura preferida.`
      },
      {
        key: "sofas",
        code: "SOFA",
        brand: "Marrow Home",
        count: 5,
        priceMin: 399,
        priceMax: 1199,
        lines: ["Sofá Modular Harlow", "Sofá Seccional Harlow Corner", "Sofá Loveseat Ridge", "Sofá Cama Fenwick", "Sofá Reclinable Dune"],
        colors: ["Gris piedra", "Beige arena", "Verde bosque"],
        tags: ["sofa", "sala", "muebles"],
        specsFn: () => ({
          Tapiceria: "Tela boucle resistente a manchas",
          Estructura: "Madera de pino maciza",
          Relleno: "Espuma de alta densidad",
          Ensamble: "Modular, sin herramientas"
        }),
        descBody: () => "La espuma de alta densidad recupera su forma incluso después de meses de uso diario, y la tela resiste manchas comunes sin decolorarse."
      },
      {
        key: "estanterias",
        code: "ESTA",
        brand: "Marrow Home",
        count: 5,
        priceMin: 89,
        priceMax: 329,
        lines: ["Estantería Modular Birch", "Estantería de Escalera Loft", "Estantería Flotante Set x3", "Estantería con Puertas Haven", "Estantería Alta Vertik"],
        colors: ["Roble claro", "Negro mate", "Blanco"],
        tags: ["estanteria", "organizacion", "muebles"],
        specsFn: () => ({
          Material: "Tablero de particulas con chapa de madera",
          "Capacidad por repisa": "15 kg",
          Ensamble: "Requiere herramientas basicas incluidas",
          Anclaje: "Kit antivuelco incluido"
        }),
        descBody: (line) => `${line} incluye el kit antivuelco de fábrica, un detalle que la mayoría de estanterías de este precio dejan por fuera.`
      }
    ]
  },
  {
    slug: "laptops",
    code: "LAP",
    subcats: [
      {
        key: "ultrabooks",
        code: "ULTR",
        brand: "Kaelo",
        count: 7,
        priceMin: 799,
        priceMax: 1599,
        lines: ["Kaelo Air 14", "Kaelo Air 14 Plus", "Kaelo Slate 13", "Kaelo Slate 13 Pro", "Kaelo Feather 15", "Kaelo Feather 15 Touch", "Kaelo Air 16"],
        colors: ["Gris espacial", "Plata", "Azul medianoche"],
        tags: ["laptop", "ultrabook", "portatil"],
        specsFn: () => ({
          Pantalla: "14\" IPS 1440p 120Hz",
          Procesador: "8-core de bajo consumo",
          RAM: "16 GB",
          Almacenamiento: "512 GB SSD NVMe",
          Peso: "1.3 kg",
          Bateria: "Hasta 18 h"
        }),
        descBody: (line) => `${line} cabe en cualquier mochila y aguanta una jornada completa de trabajo sin buscar un enchufe, algo poco común en este rango de precio.`
      },
      {
        key: "gaming",
        code: "GAMI",
        brand: "Ridgeline",
        count: 6,
        priceMin: 1099,
        priceMax: 2199,
        lines: ["Ridgeline Vanguard 16", "Ridgeline Vanguard 16 RTX", "Ridgeline Onyx 15", "Ridgeline Onyx 15 OC", "Ridgeline Apex 17", "Ridgeline Apex 17 Elite"],
        colors: ["Negro con RGB", "Gris titanio"],
        tags: ["laptop", "gaming", "alto-rendimiento"],
        specsFn: () => ({
          Pantalla: "16\" QHD 165Hz",
          Procesador: "12-core de alto rendimiento",
          "Tarjeta grafica": "Dedicada de gama alta",
          RAM: "32 GB",
          Almacenamiento: "1 TB SSD NVMe",
          Refrigeracion: "Doble ventilador con vapor chamber"
        }),
        descBody: (line) => `${line} mantiene el rendimiento estable en sesiones largas gracias al sistema de vapor chamber, sin el throttling típico de los gaming laptops más baratos.`
      },
      {
        key: "workstations",
        code: "WORK",
        brand: "Kaelo",
        count: 4,
        priceMin: 1799,
        priceMax: 2699,
        lines: ["Kaelo Forge 16", "Kaelo Forge 16 Studio", "Kaelo Forge 18", "Kaelo Forge 18 Pro"],
        colors: ["Gris espacial"],
        tags: ["laptop", "workstation", "creadores"],
        specsFn: () => ({
          Pantalla: "16\" 4K color-accurate",
          Procesador: "12-core de alto rendimiento",
          "Tarjeta grafica": "Dedicada para diseño y video",
          RAM: "64 GB",
          Almacenamiento: "2 TB SSD NVMe"
        }),
        descBody: (line) => `${line} está calibrado de fábrica para trabajo de color, pensado para edición de video y diseño donde la precisión de pantalla no es negociable.`
      },
      {
        key: "dosuno",
        code: "DOSU",
        brand: "Ridgeline",
        count: 5,
        priceMin: 649,
        priceMax: 1099,
        lines: ["Ridgeline Flex 13 2-en-1", "Ridgeline Flex 13 2-en-1 Pen", "Ridgeline Swivel 14", "Ridgeline Swivel 14 Plus", "Ridgeline Flex 15 2-en-1"],
        colors: ["Plata", "Gris grafito"],
        tags: ["laptop", "2-en-1", "convertible"],
        specsFn: () => ({
          Pantalla: "13\" táctil FHD, giro 360°",
          Procesador: "8-core de bajo consumo",
          RAM: "16 GB",
          Almacenamiento: "512 GB SSD NVMe",
          Lapiz: "Compatible, se vende por separado salvo modelos Pen"
        }),
        descBody: (line) => `${line} se dobla completo para usarse como tablet en el sofá y vuelve a modo laptop para escribir, sin perder estabilidad en la bisagra.`
      }
    ]
  },
  {
    slug: "home-decoration",
    code: "DEC",
    subcats: [
      {
        key: "iluminacion",
        code: "ILUM",
        brand: "Lucent",
        count: 5,
        priceMin: 22,
        priceMax: 89,
        lines: ["Lámpara de Mesa Arc", "Lámpara de Piso Halo", "Lámpara Colgante Orbit", "Set de Luces Ambient x3", "Lámpara de Escritorio Flex"],
        colors: ["Negro mate", "Latón cepillado", "Blanco"],
        tags: ["iluminacion", "decoracion", "hogar"],
        specsFn: () => ({
          Fuente: "LED regulable incluido",
          Temperatura: "Cálida 2700K-3000K",
          Material: "Metal con base estable",
          Cable: "1.8 m con interruptor en línea"
        }),
        descBody: (line) => `${line} da una luz cálida que no cansa la vista en sesiones largas de lectura o trabajo nocturno.`
      },
      {
        key: "textiles",
        code: "TEXT",
        brand: "Glowform",
        count: 5,
        priceMin: 18,
        priceMax: 65,
        lines: ["Set de Cojines Terra x2", "Manta Tejida Nordic", "Tapete de Área Woven", "Cortinas Blackout Duo", "Cobertor Ligero Cloud"],
        colors: ["Terracota", "Gris niebla", "Crudo"],
        tags: ["textil", "decoracion", "hogar"],
        specsFn: () => ({
          Material: "Algodón y poliéster mezclado",
          Cuidado: "Lavable a máquina",
          Relleno: "Fibra hueca siliconada (donde aplica)",
          Origen: "Tejido de telar"
        }),
        descBody: () => "Suaviza cualquier espacio sin exigir cuidados especiales: entra directo a la lavadora sin perder textura ni color tras varios lavados."
      },
      {
        key: "organizacion",
        code: "ORGA",
        brand: "Glowform",
        count: 5,
        priceMin: 14,
        priceMax: 55,
        lines: ["Set de Cestas Apilables x3", "Organizador Modular de Cajones", "Canastas de Fibra Natural x2", "Set de Frascos Herméticos x4", "Organizador de Closet Vertical"],
        colors: ["Natural", "Gris"],
        tags: ["organizacion", "decoracion", "hogar"],
        specsFn: () => ({
          Material: "Fibra natural / plastico reciclado",
          Apilable: "Si",
          Capacidad: "Variable segun set",
          Lavable: "Superficie lavable con paño húmedo"
        }),
        descBody: (line) => `${line} recupera espacio real en cajones y clósets sin necesidad de instalar nada en la pared.`
      },
      {
        key: "arte",
        code: "ARTE",
        brand: "Lucent",
        count: 4,
        priceMin: 25,
        priceMax: 79,
        lines: ["Set de Cuadros Botanical x3", "Espejo Decorativo Arch", "Cuadro Abstracto Dune", "Reloj de Pared Minimal"],
        colors: ["Marco negro", "Marco natural"],
        tags: ["arte-pared", "decoracion", "hogar"],
        specsFn: () => ({
          Material: "Marco de madera con vidrio protector",
          Montaje: "Kit de gancho incluido",
          Tamaño: "Variable segun pieza",
          Acabado: "Mate anti-reflejo"
        }),
        descBody: (line) => `${line} llega con el kit de montaje listo, sin necesidad de comprar herrajes aparte para colgarlo.`
      }
    ]
  },
  {
    slug: "tablets",
    code: "TAB",
    subcats: [
      {
        key: "productividad",
        code: "PROD",
        brand: "Tridex",
        count: 7,
        priceMin: 329,
        priceMax: 899,
        lines: ["Tridex Slate 11", "Tridex Slate 11 Pro", "Tridex Canvas 12", "Tridex Canvas 12 Plus", "Tridex Slate 13", "Tridex Fold-Flat 11", "Tridex Canvas 12 Cellular"],
        colors: ["Gris espacial", "Plata"],
        tags: ["tablet", "productividad", "con-lapiz"],
        specsFn: () => ({
          Pantalla: "11\"-13\" IPS/OLED 120Hz",
          Procesador: "8-core de bajo consumo",
          RAM: "8 GB",
          Almacenamiento: "256 GB",
          Lapiz: "Compatible, se vende por separado",
          Bateria: "Hasta 12 h"
        }),
        descBody: (line) => `${line} reemplaza el cuaderno físico para tomar notas a mano y sincronizarlas sin fricción con el resto de dispositivos.`
      },
      {
        key: "ereader",
        code: "EREA",
        brand: "Corex",
        count: 4,
        priceMin: 99,
        priceMax: 189,
        lines: ["Corex Read 6", "Corex Read 6 Paperlight", "Corex Read 8 Plus", "Corex Read Mini"],
        colors: ["Negro", "Sage"],
        tags: ["ereader", "lectura", "tinta-electronica"],
        specsFn: () => ({
          Pantalla: "6\"-8\" tinta electrónica antirreflejo",
          Iluminacion: "LED ajustable cálido/frío",
          Almacenamiento: "16-32 GB",
          Bateria: "Semanas con uso normal",
          Resistencia: "IPX8 resistente a salpicaduras"
        }),
        descBody: () => "La tinta electrónica no cansa la vista como una pantalla retroiluminada tradicional, y la batería dura semanas en vez de horas."
      },
      {
        key: "economica",
        code: "ECON",
        brand: "Corex",
        count: 6,
        priceMin: 129,
        priceMax: 249,
        lines: ["Corex Tab Basic 10", "Corex Tab Basic 10 Kids", "Corex Tab Go 8", "Corex Tab Go 8 Plus", "Corex Tab Basic 10 LTE", "Corex Tab Mini 8"],
        colors: ["Negro", "Azul", "Rosa"],
        tags: ["tablet", "economica", "entretenimiento"],
        specsFn: () => ({
          Pantalla: "8\"-10\" IPS 60Hz",
          Procesador: "Quad-core",
          RAM: "4 GB",
          Almacenamiento: "64-128 GB, expandible",
          Bateria: "Hasta 9 h"
        }),
        descBody: () => "Suficiente para video, lectura y juegos livianos sin pagar de más por potencia que no se va a usar en el uso diario de la casa."
      }
    ]
  },
  {
    slug: "mens-watches",
    code: "MWA",
    subcats: [
      {
        key: "deportivos",
        code: "DEPO",
        brand: "Chronoly",
        count: 6,
        priceMin: 79,
        priceMax: 249,
        lines: ["Chronoly Trailblazer", "Chronoly Trailblazer GMT", "Chronoly Ranger Pro", "Chronoly Ranger Dive", "Chronoly Sprint", "Chronoly Sprint Chrono"],
        colors: ["Negro", "Verde militar", "Acero"],
        tags: ["reloj-hombre", "deportivo", "resistente-al-agua"],
        specsFn: () => ({
          Movimiento: "Cuarzo japonés",
          Resistencia: "100 m",
          Caja: "Acero inoxidable 42-44mm",
          Correa: "Silicona o acero, según modelo",
          Cristal: "Mineral resistente a rayones"
        }),
        descBody: (line) => `${line} soporta natación en piscina y lluvia sin problema, con una corona atornillada que sella bien contra el agua.`
      },
      {
        key: "clasicos",
        code: "CLAS",
        brand: "Chronoly",
        count: 5,
        priceMin: 99,
        priceMax: 329,
        lines: ["Chronoly Heritage", "Chronoly Heritage Date", "Chronoly Oakwood", "Chronoly Oakwood Two-Tone", "Chronoly Meridian Classic"],
        colors: ["Plata", "Oro rosa", "Negro"],
        tags: ["reloj-hombre", "clasico", "vestir"],
        specsFn: () => ({
          Movimiento: "Cuarzo japonés",
          Caja: "Acero inoxidable 40mm",
          Correa: "Cuero genuino o malla milanesa",
          Cristal: "Zafiro resistente a rayones",
          Resistencia: "30 m"
        }),
        descBody: (line) => `${line} funciona igual de bien con traje que con ropa de diario, sin el grosor exagerado de los relojes deportivos.`
      },
      {
        key: "smartwatch",
        code: "SMAR",
        brand: "Aevum",
        count: 5,
        priceMin: 149,
        priceMax: 399,
        lines: ["Aevum Pulse", "Aevum Pulse GPS", "Aevum Orbit", "Aevum Orbit Titanium", "Aevum Pulse Active"],
        colors: ["Negro", "Grafito", "Plata"],
        tags: ["smartwatch", "reloj-hombre", "salud"],
        specsFn: () => ({
          Pantalla: "AMOLED siempre activa",
          Sensores: "Frecuencia cardiaca, SpO2, GPS",
          Bateria: "Hasta 6 dias",
          Resistencia: "5 ATM",
          Compatibilidad: "iOS y Android"
        }),
        descBody: (line) => `${line} aguanta casi una semana de uso real con la pantalla siempre encendida, sin sacrificar precisión en el seguimiento de actividad.`
      }
    ]
  },
  {
    slug: "womens-watches",
    code: "WWA",
    subcats: [
      {
        key: "elegantes",
        code: "ELEG",
        brand: "Meridian Time",
        count: 6,
        priceMin: 89,
        priceMax: 299,
        lines: ["Meridian Aurora", "Meridian Aurora Mini", "Meridian Willow", "Meridian Willow Pearl", "Meridian Lumen", "Meridian Lumen Gold"],
        colors: ["Oro rosa", "Plata", "Oro"],
        tags: ["reloj-mujer", "elegante", "vestir"],
        specsFn: () => ({
          Movimiento: "Cuarzo japonés",
          Caja: "Acero inoxidable 28-34mm",
          Correa: "Malla milanesa o cuero",
          Cristal: "Mineral resistente a rayones",
          Resistencia: "30 m"
        }),
        descBody: (line) => `${line} tiene una caja delgada que entra bajo cualquier manga sin marcar bulto, pensada para uso diario en oficina.`
      },
      {
        key: "deportivos",
        code: "DEPO",
        brand: "Meridian Time",
        count: 5,
        priceMin: 69,
        priceMax: 189,
        lines: ["Meridian Active", "Meridian Active Chrono", "Meridian Tide", "Meridian Tide Dive", "Meridian Sprint Mini"],
        colors: ["Blanco", "Coral", "Negro"],
        tags: ["reloj-mujer", "deportivo", "resistente-al-agua"],
        specsFn: () => ({
          Movimiento: "Cuarzo japonés",
          Resistencia: "50-100 m",
          Caja: "Aleación ligera 34-38mm",
          Correa: "Silicona",
          Cristal: "Mineral resistente a rayones"
        }),
        descBody: () => "Ligero en la muñeca incluso durante entrenamiento, con correa de silicona que no irrita la piel en sesiones largas de sudor."
      },
      {
        key: "smartwatch",
        code: "SMAR",
        brand: "Aevum",
        count: 5,
        priceMin: 159,
        priceMax: 379,
        lines: ["Aevum Bloom", "Aevum Bloom GPS", "Aevum Halo Mini", "Aevum Halo Mini Rose", "Aevum Bloom Active"],
        colors: ["Rosa", "Blanco", "Negro"],
        tags: ["smartwatch", "reloj-mujer", "salud"],
        specsFn: () => ({
          Pantalla: "AMOLED siempre activa",
          Sensores: "Frecuencia cardiaca, ciclo menstrual, SpO2",
          Bateria: "Hasta 6 dias",
          Resistencia: "5 ATM",
          Compatibilidad: "iOS y Android"
        }),
        descBody: (line) => `${line} incluye seguimiento de ciclo además de las métricas de actividad habituales, en una caja pensada para muñecas pequeñas.`
      }
    ]
  },
  {
    slug: "sports-accessories",
    code: "SPT",
    subcats: [
      {
        key: "fitness",
        code: "FITN",
        brand: "Pulsegear",
        count: 4,
        priceMin: 19,
        priceMax: 59,
        lines: ["Banda de Frecuencia Cardiaca Pulsegear", "Bandas de Resistencia Set x5", "Cuerda de Salto con Contador", "Guantes de Entrenamiento Grip"],
        colors: ["Negro", "Gris"],
        tags: ["fitness", "entrenamiento", "deporte"],
        specsFn: () => ({
          Material: "Neopreno / silicona reforzada",
          Uso: "Interior y exterior",
          Ajuste: "Talla unica ajustable",
          Cuidado: "Lavable a mano"
        }),
        descBody: () => "Pensado para rutinas en casa o gimnasio sin depender de máquinas grandes, fácil de guardar en un cajón."
      },
      {
        key: "hidratacion",
        code: "HIDR",
        brand: "Pulsegear",
        count: 4,
        priceMin: 15,
        priceMax: 42,
        lines: ["Botella Térmica 750ml", "Botella Térmica 1L con Filtro", "Shaker con Compartimento", "Botella Plegable de Silicona"],
        colors: ["Negro", "Azul acero", "Verde"],
        tags: ["hidratacion", "deporte", "termo"],
        specsFn: () => ({
          Material: "Acero inoxidable de doble pared / Tritan",
          Capacidad: "500-1000 ml",
          Aislamiento: "Frio 24h / calor 12h (versiones termicas)",
          Libre_de: "BPA"
        }),
        descBody: (line) => `${line} mantiene la temperatura durante todo el entrenamiento sin sudar por fuera ni transferir sabores entre líquidos.`
      },
      {
        key: "casa",
        code: "CASA",
        brand: "Northpeak",
        count: 4,
        priceMin: 25,
        priceMax: 89,
        lines: ["Set de Mancuernas Ajustables", "Rodillo de Espuma Recovery", "Colchoneta de Yoga Grip", "Barra de Dominadas para Puerta"],
        colors: ["Negro", "Gris"],
        tags: ["entrenamiento-en-casa", "deporte", "fitness"],
        specsFn: () => ({
          Material: "Hierro fundido / espuma EVA",
          Espacio: "Compacto, apto para apartamento",
          "Peso maximo": "Variable segun producto",
          Superficie: "Antideslizante"
        }),
        descBody: (line) => `${line} resuelve entrenar en un apartamento pequeño sin necesitar una habitación dedicada al gimnasio.`
      },
      {
        key: "ciclismo",
        code: "CICL",
        brand: "Northpeak",
        count: 3,
        priceMin: 29,
        priceMax: 99,
        lines: ["Luz Trasera Recargable para Bici", "Casco de Ciclismo Urbano", "Soporte de Celular para Manubrio"],
        colors: ["Negro"],
        tags: ["ciclismo", "deporte", "urbano"],
        specsFn: () => ({
          Material: "Policarbonato / aluminio",
          Bateria: "Recargable USB-C (donde aplica)",
          Ajuste: "Universal para manubrios estandar",
          Visibilidad: "Alta, reflectante"
        }),
        descBody: (line) => `${line} está pensado para ciclismo urbano nocturno, donde la visibilidad importa tanto como la comodidad.`
      }
    ]
  },
  {
    slug: "sunglasses",
    code: "SUN",
    subcats: [
      {
        key: "polarizados",
        code: "POLA",
        brand: "Solmark",
        count: 6,
        priceMin: 39,
        priceMax: 149,
        lines: ["Solmark Horizon", "Solmark Horizon XL", "Solmark Drift", "Solmark Drift Mirror", "Solmark Coastal", "Solmark Coastal Wood"],
        colors: ["Negro mate", "Carey", "Verde botella"],
        tags: ["gafas-de-sol", "polarizado", "uv400"],
        specsFn: () => ({
          Lente: "Polarizada, proteccion UV400",
          Montura: "Acetato / TR90",
          Estuche: "Rigido incluido",
          Peso: "24-30 g"
        }),
        descBody: (line) => `${line} corta el reflejo del agua y del pavimento mojado, no solo oscurece la vista como unas gafas comunes.`
      },
      {
        key: "deportivas",
        code: "DEPO",
        brand: "Solmark",
        count: 3,
        priceMin: 45,
        priceMax: 119,
        lines: ["Solmark Ridge Sport", "Solmark Ridge Sport Mirror", "Solmark Velocity"],
        colors: ["Negro", "Gris humo"],
        tags: ["gafas-de-sol", "deportivo", "ciclismo"],
        specsFn: () => ({
          Lente: "Policarbonato irrompible, UV400",
          Montura: "TR90 flexible",
          Ajuste: "Almohadillas antideslizantes",
          Ventilacion: "Canales anti-empañado"
        }),
        descBody: () => "No se empañan a mitad de trote gracias a los canales de ventilación en el puente, y no se resbalan con el sudor."
      },
      {
        key: "deportivasFendra",
        code: "DEPO",
        brand: "Fendra",
        count: 2,
        priceMin: 35,
        priceMax: 79,
        lines: ["Fendra Runner", "Fendra Runner Polarized"],
        colors: ["Negro", "Azul"],
        tags: ["gafas-de-sol", "deportivo", "running"],
        specsFn: () => ({
          Lente: "Policarbonato, UV400",
          Montura: "TR90 ultraligera",
          Peso: "19 g",
          Ajuste: "Antideslizante"
        }),
        descBody: (line) => `${line} pesa lo mismo que casi nada en la cara, pensado para correr sin notar que las lleva puestas.`
      },
      {
        key: "moda",
        code: "MODA",
        brand: "Fendra",
        count: 4,
        priceMin: 29,
        priceMax: 89,
        lines: ["Fendra Retro Round", "Fendra Retro Round Tinted", "Fendra Cat Eye", "Fendra Square Bold"],
        colors: ["Carey", "Negro", "Transparente"],
        tags: ["gafas-de-sol", "moda", "uv400"],
        specsFn: () => ({
          Lente: "Proteccion UV400",
          Montura: "Acetato",
          Estuche: "Blando incluido",
          Estilo: "Tendencia temporada"
        }),
        descBody: (line) => `${line} funciona como accesorio antes que como protección técnica: pensadas para completar un outfit.`
      }
    ]
  }
];

const products = [];
let globalId = 1;
const usedSlugs = new Set();
const usedSkus = new Set();
const bannedWords = ["premium", "alta calidad", "innovador", "revolucionario", "de ultima generacion", "perfecto para"];
const bannedCount = Object.fromEntries(bannedWords.map((w) => [w, 0]));

function checkBanned(text) {
  const lower = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const word of bannedWords) {
    if (lower.includes(word)) bannedCount[word] += 1;
  }
}

const startDate = new Date("2024-10-01");
const endDate = new Date("2026-07-01");
function createdAtFor(i, total) {
  const t = total <= 1 ? 0 : i / (total - 1);
  const ms = startDate.getTime() + t * (endDate.getTime() - startDate.getTime());
  return new Date(ms).toISOString().slice(0, 10);
}

let variantColorCursor = 0;

for (const category of CATEGORIES) {
  for (const sub of category.subcats) {
    for (let i = 0; i < sub.count; i += 1) {
      const line = sub.lines[i % sub.lines.length];
      const name = `${line}`;
      let slug = slugify(name);
      let suffix = 1;
      while (usedSlugs.has(slug)) {
        suffix += 1;
        slug = `${slugify(name)}-${suffix}`;
      }
      usedSlugs.add(slug);

      const idNum = String(globalId).padStart(4, "0");
      const id = `prd_${idNum}`;
      let sku = `${category.code}-${sub.code}-${idNum}`;
      while (usedSkus.has(sku)) sku = `${sku}X`;
      usedSkus.add(sku);

      const price = priceIn(sub.priceMin, sub.priceMax, i, sub.count);
      const hasCompare = globalId % 3 === 0; // ~33%, close to the 35% target
      const compareAtPrice = hasCompare ? Math.round(price * (1 + (0.1 + (globalId % 5) * 0.05))) : undefined;

      const rating = correlatedRating();
      const reviewCount = reviewCountFor(rating);
      const stock = stockFor();

      const colorSet = sub.colors;
      const color = colorSet[variantColorCursor % colorSet.length];
      variantColorCursor += 1;

      const specs = sub.specsFn(line, price);
      const bodySentence = sub.descBody(line, price);
      const firstClause = bodySentence.split(". ")[0].replace(/\.$/, "");
      const shortDescription =
        firstClause.length <= 108
          ? `${firstClause}.`
          : `${firstClause.slice(0, firstClause.slice(0, 105).lastIndexOf(" "))}...`;
      const description = `${bodySentence} Disponible en ${colorSet.slice(0, 3).join(", ").toLowerCase()}, con envío desde el catálogo de ${category.slug.replace("-", " ")} de Aether.`;

      checkBanned(shortDescription);
      checkBanned(description);

      const highlights = [
        Object.entries(specs)[0] ? `${Object.entries(specs)[0][0]}: ${Object.entries(specs)[0][1]}` : "Construcción pensada para uso diario",
        Object.entries(specs)[1] ? `${Object.entries(specs)[1][0]}: ${Object.entries(specs)[1][1]}` : "Acabado resistente al uso frecuente",
        `Disponible en ${colorSet.length} colores`
      ];

      const featured = globalId % 23 === 0;
      const isNew = globalId % 11 === 0;

      const imagePrompt = `${bodySentence.split(".")[0]}, ${color.toLowerCase()} color, ${line.toLowerCase()}${CATEGORY_STYLE_EXTRA[category.slug] ?? ""}. ${STYLE_BASE}`;

      products.push({
        id,
        sku,
        slug,
        name,
        brand: sub.brand,
        category: category.slug,
        subcategory: sub.key.replace(/[A-Z].*$/, "").replace(/\d+$/, "") || sub.key,
        price,
        ...(compareAtPrice ? { compareAtPrice } : {}),
        currency: "USD",
        stock,
        rating: Math.round(rating * 10) / 10,
        reviewCount,
        shortDescription,
        description,
        highlights,
        specs,
        tags: sub.tags,
        variants: [{ type: "color", options: colorSet }],
        images: {
          main: `/products/${slug}-1.webp`,
          gallery: [`/products/${slug}-2.webp`, `/products/${slug}-3.webp`]
        },
        imagePrompt,
        featured,
        isNew,
        createdAt: createdAtFor(globalId - 1, 200)
      });

      globalId += 1;
    }
  }
}

// Gallery angle variants, used later by the image script - stored alongside
// the file so generate-images.mjs doesn't need to re-derive them.
const galleryAngles = GALLERY_ANGLES;

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(products, null, 2) + "\n", "utf8");

console.log(`Wrote ${products.length} products to ${outPath}`);
console.log("Banned-word usage:", bannedCount);
writeFileSync(
  path.join(__dirname, "..", "data", "gallery-angles.json"),
  JSON.stringify(galleryAngles, null, 2) + "\n",
  "utf8"
);
