export const legalPolicyVersion = "2026-08-12";

export type LegalDocumentKey = "privacy" | "cookies" | "terms" | "returns" | "shipping";

type LegalSection = {
  title: string;
  paragraphs?: string[];
  items?: string[];
  links?: Array<{ label: string; href: string }>;
};

type LegalDocument = {
  eyebrow: string;
  title: string;
  summary: string;
  updated: string;
  sections: LegalSection[];
};

type Locale = "en" | "es";

export const legalDocuments: Record<Locale, Record<LegalDocumentKey, LegalDocument>> = {
  es: {
    privacy: {
      eyebrow: "Legal / Datos personales",
      title: "Política de tratamiento de datos personales y privacidad",
      summary:
        "Explica qué información usa la demo Aether, cómo funciona el asistente con IA y cómo ejercer tus derechos.",
      updated: "Última actualización: 12 de agosto de 2026 · Versión 2026-08-12",
      sections: [
        {
          title: "1. Responsable y canales",
          paragraphs: [
            "El responsable del tratamiento es Diego Fernando Martinez, profesional independiente. Domicilio y dirección: Carrera 73 # 20A-40, Medellín, Antioquia, Colombia. Correo: diferez676@gmail.com. Teléfono: +57 304 274 9571.",
            "Esta política cubre la tienda demostrativa Aether, sus cuentas, carrito, checkout de prueba, formularios y el Asistente Aether. Puedes presentar consultas, reclamos, solicitudes de acceso, corrección, revocación o supresión por correo, teléfono o mediante el formulario de contacto."
          ]
        },
        {
          title: "2. Información tratada",
          items: [
            "Cuenta: identificador de Clerk, nombre, correo, estado de sesión y roles necesarios para autenticarte.",
            "Compra demostrativa: identificador de carrito, productos, favoritos, cupones, importes, correo, referencias de Stripe en modo de prueba, estado del pedido y eventos técnicos. Aether no recibe ni guarda el número completo de tarjeta, CVC ni credenciales bancarias.",
            "Contacto: nombre, correo, empresa opcional, asunto, mensaje, idioma y prueba de autorización.",
            "Asistente: texto enviado, respuesta, idioma, página o producto desde el cual consultas, contexto de carrito estrictamente necesario, identificador de conversación y un hash del identificador de sesión. Antes de guardar el texto se sustituyen patrones evidentes de correo, teléfono y tarjeta; esta protección no es infalible.",
            "Dispositivo: idioma, tema, carrito y favoritos guardados en el navegador; identificadores temporales de carrito y conversación; además de IP, agente de usuario y registros que los proveedores de infraestructura puedan generar para seguridad."
          ]
        },
        {
          title: "3. Finalidades y autorización",
          items: [
            "Operar la demo, autenticar cuentas, mantener carrito y favoritos, ejecutar el checkout sandbox y mostrar pedidos de prueba.",
            "Responder mensajes, conservar prueba de autorización y atender solicitudes de privacidad.",
            "Permitir que el Asistente Aether busque productos, responda sobre la tienda y, con instrucciones suficientes, modifique el carrito.",
            "Prevenir abuso, fraude, acceso entre usuarios, errores operativos y uso excesivo del asistente.",
            "El envío de formularios y la casilla previa al primer mensaje del asistente constituyen autorización previa e informada para esas finalidades. Los datos no se venden, no se usan para publicidad y no se toman decisiones legales o crediticias automatizadas."
          ]
        },
        {
          title: "4. Asistente Aether y Gemini",
          paragraphs: [
            "Sí se guardan los chats. Aether conserva mensajes redactados y respuestas en Cloudflare D1 para restaurar el contexto. El mensaje original puede enviarse a la API de Google Gemini para clasificar la intención, extraer una búsqueda o redactar una respuesta limitada. No incluyas contraseñas, datos de tarjeta, documentos de identidad, información médica ni otros datos sensibles.",
            "El asistente puede equivocarse y no sustituye asesoría humana. Las acciones de carrito se registran en una bitácora de seguridad. El botón “Eliminar chat” solicita la eliminación de los mensajes del servidor y luego borra el identificador de la pestaña."
          ],
          links: [
            {
              label: "Información de privacidad de la API de Gemini",
              href: "https://ai.google.dev/gemini-api/docs/zdr?hl=es-419"
            }
          ]
        },
        {
          title: "5. Encargados y transferencias",
          items: [
            "Cloudflare: alojamiento, seguridad, Workers y base de datos D1.",
            "Clerk: autenticación y gestión de la cuenta.",
            "Stripe: checkout y pagos únicamente en entorno de prueba.",
            "Google Gemini: procesamiento de algunas consultas del asistente.",
            "Resend: entrega del mensaje de contacto cuando el servicio está configurado."
          ],
          paragraphs: [
            "Estos proveedores pueden tratar información fuera de Colombia conforme a sus términos, medidas de seguridad y acuerdos de tratamiento. Solo se les entrega la información necesaria para su función."
          ]
        },
        {
          title: "6. Conservación",
          items: [
            "Chats: 30 días desde el inicio de la conversación, salvo eliminación anterior. La depuración automática elimina mensajes y metadatos vencidos.",
            "Bitácoras de acciones y métricas agregadas del asistente: hasta 12 meses para seguridad y diagnóstico; no contienen el texto completo del mensaje.",
            "Mensajes de contacto y prueba de autorización: hasta 12 meses, salvo obligación legal o reclamación vigente.",
            "Carritos anónimos del servidor: se depuran después de 90 días de inactividad. Carrito, favoritos, tema e idioma locales permanecen hasta que los borres desde el navegador.",
            "Cuenta, favoritos asociados y direcciones: mientras la cuenta esté activa o hasta una solicitud procedente. Pedidos y eventos sandbox permanecen durante la vida operativa de la demo o el tiempo necesario para seguridad, auditoría o una reclamación."
          ]
        },
        {
          title: "7. Derechos y procedimiento",
          items: [
            "Conocer, acceder, actualizar, rectificar y solicitar copia de tus datos.",
            "Solicitar prueba de la autorización y conocer el uso realizado.",
            "Revocar la autorización o pedir supresión cuando sea procedente, sin afectar obligaciones legales ni registros antifraude indispensables.",
            "Presentar una queja ante la Superintendencia de Industria y Comercio después de agotar el trámite directo cuando corresponda."
          ],
          paragraphs: [
            "Envía la solicitud a diferez676@gmail.com con tu nombre, el derecho que deseas ejercer y datos suficientes para verificar tu identidad. Las consultas se atienden hasta en 10 días hábiles y los reclamos hasta en 15 días hábiles, con las ampliaciones permitidas por la ley colombiana."
          ],
          links: [
            {
              label: "Superintendencia de Industria y Comercio",
              href: "https://sedeelectronica.sic.gov.co/"
            }
          ]
        },
        {
          title: "8. Menores, seguridad y cambios",
          paragraphs: [
            "Aether no está dirigido a menores de edad y no pretende recopilar sus datos. Se aplican minimización, validación, control de acceso, cifrado en tránsito, tokens de carrito, límites de uso y redacción de patrones sensibles. Ningún sistema es infalible.",
            "Los cambios sustanciales se publicarán aquí con una nueva versión y se solicitará nuevamente autorización cuando sea necesario."
          ]
        }
      ]
    },
    cookies: {
      eyebrow: "Legal / Navegador",
      title: "Política de cookies y almacenamiento local",
      summary:
        "Aether no usa publicidad ni analítica. Estas son las tecnologías funcionales que mantienen la cuenta, el carrito y tus preferencias.",
      updated: "Última actualización: 12 de agosto de 2026",
      sections: [
        {
          title: "1. Uso actual",
          paragraphs: [
            "La tienda no instala cookies publicitarias, de perfiles ni de analítica. El aviso es informativo porque las tecnologías actuales son necesarias o funcionales para prestar las características solicitadas."
          ]
        },
        {
          title: "2. Cookies necesarias",
          items: [
            "Clerk puede usar cookies o tokens de sesión indispensables cuando creas una cuenta o inicias sesión.",
            "Stripe puede usar tecnologías necesarias en su dominio cuando abres el checkout sandbox. Aether no controla esas cookies de tercero."
          ]
        },
        {
          title: "3. Almacenamiento de este sitio",
          items: [
            "Local: aether.locale y aether.theme.v1 para idioma y apariencia; identificador y productos del carrito; favoritos; y la marca de migración de datos antiguos.",
            "De sesión: token temporal del carrito, identificador del chat y constancia de que aceptaste el aviso del asistente. Se eliminan normalmente al cerrar la sesión del navegador.",
            "Aviso: aether.cookieNotice.v1 recuerda que cerraste esta notificación."
          ]
        },
        {
          title: "4. Cómo gestionarlas",
          paragraphs: [
            "Puedes borrar cookies y almacenamiento desde la configuración del navegador. Al hacerlo cerrarás la sesión o perderás carrito, favoritos, idioma, tema e historial visible del chat. Las funciones esenciales no se activan con fines publicitarios."
          ]
        },
        {
          title: "5. Cambios",
          paragraphs: [
            "Si en el futuro se incorporan analítica, personalización no esencial o publicidad, se añadirá un panel para aceptar o rechazar esas categorías antes de activarlas cuando la ley lo exija."
          ]
        }
      ]
    },
    terms: {
      eyebrow: "Legal / Uso",
      title: "Términos y condiciones de uso",
      summary:
        "Condiciones de acceso a Aether, una demostración técnica y no una tienda comercial operativa.",
      updated: "Última actualización: 12 de agosto de 2026",
      sections: [
        {
          title: "1. Identidad y naturaleza de la demo",
          paragraphs: [
            "Aether es una demostración de portafolio operada por Diego Fernando Martinez desde Carrera 73 # 20A-40, Medellín, Antioquia, Colombia. Contacto: diferez676@gmail.com y +57 304 274 9571.",
            "No hay venta real: el catálogo, inventario, impuestos, envío, cupones, pedidos, devoluciones y reembolsos son simulados. Stripe funciona en modo de prueba y no debes introducir una tarjeta real. Ningún checkout crea una obligación de entrega, una compraventa real ni un cobro válido."
          ]
        },
        {
          title: "2. Cuenta y seguridad",
          paragraphs: [
            "Eres responsable de proteger tu sesión y de usar información correcta. No compartas credenciales ni intentes acceder a carritos, chats, pedidos o datos de otra persona. Clerk presta la autenticación bajo sus propias condiciones."
          ]
        },
        {
          title: "3. Asistente con IA",
          paragraphs: [
            "El Asistente Aether puede buscar productos y modificar el carrito cuando interpreta una instrucción con suficiente confianza. Sus respuestas pueden ser incompletas o incorrectas; revisa siempre el carrito y el resumen antes del checkout. No uses el chat para datos sensibles, emergencias ni asesoría profesional."
          ]
        },
        {
          title: "4. Uso permitido",
          items: [
            "No vulnerar la seguridad, eludir límites, automatizar abuso, introducir malware, hacer ingeniería inversa de secretos ni suplantar a terceros.",
            "No enviar contenido ilícito, difamatorio, discriminatorio, invasivo o que vulnere propiedad intelectual o privacidad.",
            "No representar los productos, precios, pedidos o comprobantes de la demo como transacciones reales."
          ]
        },
        {
          title: "5. Propiedad intelectual y terceros",
          paragraphs: [
            "El diseño, código y textos originales pertenecen a sus respectivos autores y titulares. Las marcas, imágenes, productos y servicios de terceros se usan con fines demostrativos y conservan la titularidad de sus propietarios.",
            "Cloudflare, Clerk, Stripe, Google, Resend y los proveedores de catálogo operan servicios externos sujetos a sus propias condiciones."
          ]
        },
        {
          title: "6. Disponibilidad y responsabilidad",
          paragraphs: [
            "La demo se ofrece tal como está y puede cambiar, fallar o suspenderse. En la medida permitida por la ley, no se garantiza disponibilidad, exactitud del catálogo ni aptitud para un propósito comercial. Nada limita derechos imperativos ni responsabilidad que legalmente no pueda excluirse."
          ]
        },
        {
          title: "7. Ley aplicable y contacto",
          paragraphs: [
            "Se aplica la ley colombiana. Antes de una reclamación formal, puedes escribir a diferez676@gmail.com. Las autoridades y jueces competentes se determinan conforme a las normas aplicables."
          ],
          links: [
            {
              label: "Autoridad colombiana de protección al consumidor (SIC)",
              href: "https://sedeelectronica.sic.gov.co/"
            }
          ]
        }
      ]
    },
    returns: {
      eyebrow: "Ayuda / Demo",
      title: "Devoluciones, retracto y reversión",
      summary:
        "La demo no despacha productos ni procesa devoluciones reales. Esta página evita confundir una simulación con una venta.",
      updated: "Última actualización: 12 de agosto de 2026",
      sections: [
        {
          title: "1. Estado actual",
          paragraphs: [
            "Todos los pedidos, estados, devoluciones y reembolsos de Aether son pruebas. No se entrega un bien, no existe dinero real que devolver y las acciones de la cuenta solo simulan un flujo de soporte."
          ]
        },
        {
          title: "2. Si Aether habilita ventas reales",
          items: [
            "Se publicará previamente el procedimiento, canal y dirección de devolución, costos aplicables, excepciones y garantía legal.",
            "Cuando proceda el retracto en comercio electrónico colombiano, el plazo general es de cinco días hábiles desde la entrega del bien y la devolución del dinero no podrá exceder quince días calendario después de cumplir los requisitos legales.",
            "La reversión de pagos electrónicos podrá solicitarse en los eventos legales, como fraude, operación no solicitada, producto no recibido, diferente o defectuoso, dentro del plazo aplicable.",
            "Estas reglas no reducen garantías ni otros derechos imperativos del consumidor."
          ]
        },
        {
          title: "3. Contacto",
          paragraphs: [
            "Para reportar una confusión, una prueba o una reclamación relacionada con la demo, escribe a diferez676@gmail.com o llama al +57 304 274 9571."
          ],
          links: [
            {
              label: "Estatuto del Consumidor — Ley 1480 de 2011",
              href: "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306"
            },
            {
              label: "Ley 2439 de 2024",
              href: "https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=257116"
            }
          ]
        }
      ]
    },
    shipping: {
      eyebrow: "Ayuda / Demo",
      title: "Política de envíos",
      summary:
        "Los métodos, tarifas, tiempos y seguimientos visibles son datos simulados de una demostración.",
      updated: "Última actualización: 12 de agosto de 2026",
      sections: [
        {
          title: "1. No hay despacho real",
          paragraphs: [
            "Aether no recibe direcciones reales para despachar mercancía. Los nombres de transportadores, números de seguimiento, países, tiempos y tarifas son ilustrativos. No entregues una dirección real salvo que una pantalla de prueba claramente lo requiera y estés autorizado para usarla."
          ]
        },
        {
          title: "2. Información antes de una venta real",
          paragraphs: [
            "Antes de habilitar comercio real, Aether deberá informar disponibilidad, restricciones geográficas, precio total, impuestos, gastos separados de envío, medio de pago, fecha o plazo de entrega, procedimiento de retracto y condiciones contractuales accesibles antes y después de comprar."
          ]
        },
        {
          title: "3. Incidencias de la demo",
          paragraphs: [
            "Si una pantalla parece confirmar un envío real o contiene datos personales inesperados, repórtalo a diferez676@gmail.com para revisar y eliminar la información cuando proceda."
          ],
          links: [
            {
              label: "Protección del consumidor — SIC",
              href: "https://sedeelectronica.sic.gov.co/temas/proteccion-al-consumidor"
            }
          ]
        }
      ]
    }
  },
  en: {
    privacy: {
      eyebrow: "Legal / Personal data",
      title: "Personal data processing and privacy policy",
      summary:
        "Explains what the Aether demo uses, how the AI assistant works, and how to exercise your rights.",
      updated: "Last updated: August 12, 2026 · Version 2026-08-12",
      sections: [
        {
          title: "1. Controller and channels",
          paragraphs: [
            "The controller is Diego Fernando Martinez, an independent professional. Registered address: Carrera 73 # 20A-40, Medellín, Antioquia, Colombia. Email: diferez676@gmail.com. Phone: +57 304 274 9571.",
            "This policy covers the Aether store demo, accounts, cart, sandbox checkout, forms, and the Aether Assistant. You may submit privacy questions, complaints, access, correction, withdrawal, or deletion requests by email, phone, or the contact form."
          ]
        },
        {
          title: "2. Information processed",
          items: [
            "Account: Clerk identifier, name, email, session status, and roles required for authentication.",
            "Demo shopping: cart identifier, products, favorites, coupons, amounts, email, sandbox Stripe references, order status, and technical events. Aether does not receive or store full card numbers, CVCs, or bank credentials.",
            "Contact: name, email, optional company, subject, message, language, and authorization evidence.",
            "Assistant: submitted text, response, language, current page or product, strictly necessary cart context, conversation identifier, and a hash of the session identifier. Obvious email, phone, and card-like patterns are replaced before storage, but this protection is not infallible.",
            "Device: language, theme, cart and favorites in the browser; temporary cart and conversation identifiers; plus IP, user agent, and security logs infrastructure providers may generate."
          ]
        },
        {
          title: "3. Purposes and authorization",
          items: [
            "Operate the demo, authenticate accounts, maintain cart and favorites, run sandbox checkout, and display test orders.",
            "Reply to messages, retain authorization evidence, and handle privacy requests.",
            "Let the Aether Assistant search products, answer store questions, and modify the cart when instructions are sufficiently clear.",
            "Prevent abuse, fraud, cross-user access, operational errors, and excessive assistant use.",
            "Form submission and the checkbox shown before the assistant's first message provide prior informed authorization for those purposes. Data is not sold or used for advertising, and no legal or credit decision is automated."
          ]
        },
        {
          title: "4. Aether Assistant and Gemini",
          paragraphs: [
            "Chats are stored. Aether keeps redacted messages and responses in Cloudflare D1 to restore context. The original message may be sent to the Google Gemini API to classify intent, extract a search, or draft a limited reply. Do not include passwords, payment-card data, identity documents, health information, or other sensitive data.",
            "The assistant can be wrong and is not a substitute for human advice. Cart actions are recorded in a security audit trail. “Delete chat” requests server-side deletion and then removes the tab's conversation identifier."
          ],
          links: [
            {
              label: "Gemini API privacy information",
              href: "https://ai.google.dev/gemini-api/docs/zdr?hl=en"
            }
          ]
        },
        {
          title: "5. Processors and international transfers",
          items: [
            "Cloudflare: hosting, security, Workers, and D1 database.",
            "Clerk: authentication and account management.",
            "Stripe: sandbox checkout and test payments only.",
            "Google Gemini: processing of some assistant queries.",
            "Resend: delivery of contact messages when configured."
          ],
          paragraphs: [
            "These providers may process information outside Colombia under their terms, security measures, and data-processing arrangements. They receive only the information needed for their function."
          ]
        },
        {
          title: "6. Retention",
          items: [
            "Chats: 30 days from conversation creation unless deleted sooner. Automated cleanup removes expired messages and metadata.",
            "Assistant action logs and aggregate usage metrics: up to 12 months for security and diagnostics; they do not contain the full message text.",
            "Contact messages and authorization evidence: up to 12 months unless a legal duty or active claim requires longer retention.",
            "Server-side anonymous carts: cleaned after 90 days of inactivity. Local cart, favorites, theme, and language remain until you clear browser data.",
            "Account, associated favorites, and addresses: while the account remains active or until a valid request. Sandbox orders and events remain for the demo's operational life or as needed for security, audit, or a claim."
          ]
        },
        {
          title: "7. Rights and procedure",
          items: [
            "Know, access, update, correct, and request a copy of your data.",
            "Request proof of authorization and learn how data was used.",
            "Withdraw authorization or request deletion where applicable, without affecting legal duties or essential anti-fraud records.",
            "Complain to Colombia's Superintendence of Industry and Commerce after the direct process where required."
          ],
          paragraphs: [
            "Email diferez676@gmail.com with your name, requested right, and enough information to verify your identity. Colombian consultation and complaint deadlines apply where relevant."
          ],
          links: [
            {
              label: "Superintendence of Industry and Commerce",
              href: "https://sedeelectronica.sic.gov.co/"
            }
          ]
        },
        {
          title: "8. Children, security, and changes",
          paragraphs: [
            "Aether is not directed to children and does not intend to collect their data. Controls include minimization, validation, access control, encrypted transport, cart tokens, usage limits, and sensitive-pattern redaction. No system is infallible.",
            "Material changes will be published here with a new version and renewed authorization will be requested when necessary."
          ]
        }
      ]
    },
    cookies: {
      eyebrow: "Legal / Browser",
      title: "Cookie and local storage policy",
      summary:
        "Aether uses no advertising or analytics. These functional technologies maintain the account, cart, and preferences.",
      updated: "Last updated: August 12, 2026",
      sections: [
        {
          title: "1. Current use",
          paragraphs: [
            "The store does not install advertising, profiling, or analytics cookies. The notice is informational because current technologies are necessary or functional for requested features."
          ]
        },
        {
          title: "2. Necessary cookies",
          items: [
            "Clerk may use essential session cookies or tokens when you create an account or sign in.",
            "Stripe may use necessary technologies on its domain when sandbox checkout opens. Aether does not control those third-party cookies."
          ]
        },
        {
          title: "3. This site's storage",
          items: [
            "Local: aether.locale and aether.theme.v1; cart identifier and products; favorites; and the legacy-data migration marker.",
            "Session: temporary cart token, chat identifier, and the assistant privacy acknowledgement. These normally disappear when the browser session closes.",
            "Notice: aether.cookieNotice.v1 remembers that you dismissed this message."
          ]
        },
        {
          title: "4. Controls",
          paragraphs: [
            "You may clear cookies and storage in browser settings. Doing so may sign you out or remove cart, favorites, language, theme, and visible chat history. Essential features are not used for advertising."
          ]
        },
        {
          title: "5. Future changes",
          paragraphs: [
            "If analytics, non-essential personalization, or advertising is later added, Aether will provide controls to accept or reject those categories before activation where required."
          ]
        }
      ]
    },
    terms: {
      eyebrow: "Legal / Use",
      title: "Terms and conditions of use",
      summary: "Terms for Aether, a technical demonstration rather than an operating retail store.",
      updated: "Last updated: August 12, 2026",
      sections: [
        {
          title: "1. Identity and demo status",
          paragraphs: [
            "Aether is a portfolio demonstration operated by Diego Fernando Martinez from Carrera 73 # 20A-40, Medellín, Antioquia, Colombia. Contact: diferez676@gmail.com and +57 304 274 9571.",
            "There are no real sales. Catalog, inventory, tax, shipping, coupons, orders, returns, and refunds are simulated. Stripe runs in test mode and you must not enter a real card. No checkout creates a delivery duty, real purchase, or valid charge."
          ]
        },
        {
          title: "2. Account and security",
          paragraphs: [
            "You are responsible for protecting your session and using accurate information. Do not share credentials or try to access another person's carts, chats, orders, or data. Clerk provides authentication under its own terms."
          ]
        },
        {
          title: "3. AI assistant",
          paragraphs: [
            "The Aether Assistant may search products and modify the cart when it interprets an instruction with sufficient confidence. Responses may be incomplete or wrong; always review the cart and summary. Do not use chat for sensitive data, emergencies, or professional advice."
          ]
        },
        {
          title: "4. Acceptable use",
          items: [
            "Do not compromise security, evade limits, automate abuse, introduce malware, reverse-engineer secrets, or impersonate others.",
            "Do not submit unlawful, defamatory, discriminatory, invasive, or infringing content.",
            "Do not represent demo products, prices, orders, or receipts as real transactions."
          ]
        },
        {
          title: "5. Intellectual property and third parties",
          paragraphs: [
            "Original design, code, and text belong to their respective authors and owners. Third-party marks, images, products, and services remain their owners' property and are used for demonstration.",
            "Cloudflare, Clerk, Stripe, Google, Resend, and catalog providers operate external services under their own terms."
          ]
        },
        {
          title: "6. Availability and liability",
          paragraphs: [
            "The demo is provided as-is and may change, fail, or be suspended. To the extent allowed by law, availability, catalog accuracy, and fitness for commercial use are not guaranteed. Nothing limits mandatory rights or liability that cannot lawfully be excluded."
          ]
        },
        {
          title: "7. Law and contact",
          paragraphs: [
            "Colombian law applies. Before a formal claim, you may email diferez676@gmail.com. Competent authorities and courts are determined under applicable rules."
          ],
          links: [
            {
              label: "Colombian consumer authority (SIC)",
              href: "https://sedeelectronica.sic.gov.co/"
            }
          ]
        }
      ]
    },
    returns: {
      eyebrow: "Help / Demo",
      title: "Returns, withdrawal, and payment reversal",
      summary:
        "The demo ships no goods and processes no real returns. This page prevents a simulation from being confused with a sale.",
      updated: "Last updated: August 12, 2026",
      sections: [
        {
          title: "1. Current status",
          paragraphs: [
            "All Aether orders, statuses, returns, and refunds are tests. No good is delivered, there is no real money to refund, and account actions only simulate a support workflow."
          ]
        },
        {
          title: "2. If real sales are enabled",
          items: [
            "Aether will first publish the procedure, channel, return address, applicable costs, exceptions, and legal warranty.",
            "Where withdrawal applies to Colombian e-commerce, the general window is five business days after delivery and the refund may not exceed fifteen calendar days after legal requirements are met.",
            "Electronic payment reversal may be requested for statutory events such as fraud, an unauthorized transaction, non-delivery, wrong goods, or defective goods within the applicable period.",
            "These terms do not reduce warranties or other mandatory consumer rights."
          ]
        },
        {
          title: "3. Contact",
          paragraphs: [
            "To report confusion, a test issue, or a demo-related claim, email diferez676@gmail.com or call +57 304 274 9571."
          ],
          links: [
            {
              label: "Colombian Consumer Statute — Law 1480 of 2011",
              href: "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306"
            },
            {
              label: "Law 2439 of 2024",
              href: "https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=257116"
            }
          ]
        }
      ]
    },
    shipping: {
      eyebrow: "Help / Demo",
      title: "Shipping policy",
      summary: "Visible methods, rates, timelines, and tracking are simulated demonstration data.",
      updated: "Last updated: August 12, 2026",
      sections: [
        {
          title: "1. No real dispatch",
          paragraphs: [
            "Aether does not collect real addresses to dispatch merchandise. Carrier names, tracking numbers, countries, timelines, and rates are illustrative. Do not provide a real address unless a clearly labeled test screen requires it and you are authorized to use it."
          ]
        },
        {
          title: "2. Information before real sales",
          paragraphs: [
            "Before enabling commerce, Aether must disclose availability, geographic limits, total price, taxes, separate shipping charges, payment methods, delivery date or period, withdrawal procedure, and contract terms accessible before and after purchase."
          ]
        },
        {
          title: "3. Demo incidents",
          paragraphs: [
            "If a screen appears to confirm real shipping or contains unexpected personal data, report it to diferez676@gmail.com for review and deletion where applicable."
          ],
          links: [
            {
              label: "Consumer protection — SIC",
              href: "https://sedeelectronica.sic.gov.co/temas/proteccion-al-consumidor"
            }
          ]
        }
      ]
    }
  }
};
