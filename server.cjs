var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json());
var aiClient = null;
function getGeminiClient() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("A vari\xE1vel de ambiente GEMINI_API_KEY n\xE3o est\xE1 configurada.");
    }
    aiClient = new import_genai.GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return aiClient;
}
var DEFAULT_MAPILLARY_TOKEN = "MLY|27228156226813433|ff4d941ae45e04063527011e661063bc";
var MAPILLARY_TOKEN = process.env.MAPILLARY_CLIENT_TOKEN || process.env.MAPILLARY_TOKEN || DEFAULT_MAPILLARY_TOKEN;
app.get("/api/config", (req, res) => {
  res.json({
    mapillaryToken: MAPILLARY_TOKEN
  });
});
app.get("/api/mapillary/search", async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: "Par\xE2metros 'lat' e 'lng' s\xE3o obrigat\xF3rios." });
  }
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  const searchRadii = [5e-4, 15e-4, 3e-3, 6e-3, 0.012, 0.018];
  for (let i = 0; i < searchRadii.length; i++) {
    const offset = searchRadii[i];
    const min_lon = longitude - offset;
    const max_lon = longitude + offset;
    const min_lat = latitude - offset;
    const max_lat = latitude + offset;
    const bbox = `${min_lon},${min_lat},${max_lon},${max_lat}`;
    const url = `https://graph.mapillary.com/images?access_token=${MAPILLARY_TOKEN}&fields=id,geometry,captured_at,compass_angle&bbox=${bbox}&limit=15`;
    try {
      console.log(`[Mapillary] Pesquisando raio ${offset} para coordenadas [${latitude}, ${longitude}]`);
      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Mapillary API Error] Status ${response.status}: ${errorText}`);
        if (response.status === 500 || errorText.includes("reduce the amount of data")) {
          console.warn(`[Mapillary] Densidade de dados muito alta no raio ${offset}. Pulando este raio.`);
          continue;
        }
        throw new Error(`Erro na API do Mapillary: ${response.statusText}`);
      }
      const data = await response.json();
      if (data && data.data && data.data.length > 0) {
        let closestImage = data.data[0];
        let minDistance = Infinity;
        for (const img of data.data) {
          const imgLng = img.geometry.coordinates[0];
          const imgLat = img.geometry.coordinates[1];
          const dist = Math.pow(imgLat - latitude, 2) + Math.pow(imgLng - longitude, 2);
          if (dist < minDistance) {
            minDistance = dist;
            closestImage = img;
          }
        }
        console.log(`[Mapillary] Ponto encontrado no raio ${offset}. Imagem ID: ${closestImage.id}`);
        return res.json({
          imageId: closestImage.id,
          coordinates: {
            lat: closestImage.geometry.coordinates[1],
            lng: closestImage.geometry.coordinates[0]
          },
          capturedAt: closestImage.captured_at,
          compassAngle: closestImage.compass_angle || 0
        });
      }
    } catch (error) {
      console.error("[Mapillary Search Error] Falha ao consultar o Mapillary no raio:", offset, error.message);
      if (error.message && error.message.includes("403")) {
        break;
      }
    }
  }
  console.log("[Mapillary] Nenhum ponto encontrado nas proximidades. Usando fallback de seguran\xE7a.");
  return res.json({
    imageId: "142364711204983",
    // Copacabana Rio fallback
    coordinates: { lat: -22.9711, lng: -43.1822 },
    capturedAt: 1618394800,
    compassAngle: 90,
    isFallback: true
  });
});
async function fetchAddressDetails(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt,en`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "GuessThePlaceApplet/2.0 (marinasheylla@gmail.com)"
      }
    });
    if (res.ok) {
      const data = await res.json();
      return data.address;
    }
  } catch (err) {
    console.error("[Nominatim Error] Falha ao geocodificar reversamente:", err);
  }
  return null;
}
async function fetchCountryDetails(countryCode) {
  try {
    const url = `https://restcountries.com/v3.1/alpha/${countryCode}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data[0];
      }
    }
  } catch (err) {
    console.error("[RestCountries Error] Falha ao buscar detalhes do pa\xEDs:", err);
  }
  return null;
}
function generateLocalHint(level, latitude, longitude, continent, drivingSide, timezone, tld, currencyText, bordersText) {
  const hemLat = latitude >= 0 ? "Hemisf\xE9rio Norte" : "Hemisf\xE9rio Sul";
  const hemLng = longitude >= 0 ? "Hemisf\xE9rio Oriental" : "Hemisf\xE9rio Ocidental";
  switch (level) {
    case 1:
      return `\u{1F310} Orienta\xE7\xE3o Espacial: Este local est\xE1 situado no ${continent}, integrando o ${hemLat} e ${hemLng}. Os ve\xEDculos trafegam pelo ${drivingSide} e o fuso hor\xE1rio de refer\xEAncia \xE9 ${timezone}.`;
    case 2:
      return `\u{1F373} Identidade Local: A moeda oficial \xE9 ${currencyText}. O sufixo de internet local \xE9 ${tld} e o pa\xEDs ${bordersText.toLowerCase()}. A gastronomia regional apresenta pratos ricos em ingredientes tradicionais do continente.`;
    case 3:
      return `\u{1F4DA} Fato Geral: A regi\xE3o possui forte heran\xE7a cultural, com uma rica mistura de influ\xEAncias hist\xF3ricas expressas na arquitetura local e nos h\xE1bitos cotidianos das pessoas.`;
    case 4:
      return `\u{1F3A8} Caracter\xEDsticas Culturais: A vegeta\xE7\xE3o predominante, o desenho das constru\xE7\xF5es e os letreiros com caracteres t\xEDpicos das redondezas contam a hist\xF3ria e a identidade vibrante deste ponto geogr\xE1fico.`;
    default:
      return "Nenhuma pista dispon\xEDvel para este n\xEDvel.";
  }
}
var FREE_BASE_MODELS = [
  "gemini-3.5-flash",
  "gemini-2.5-flash"
];
function withTimeout(promise, ms, errorMessage = "Timeout") {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}
async function generateGeminiHint(level, latitude, longitude, placeName, description, continent, drivingSide, timezone, tld, currencyText, bordersText) {
  const ai = getGeminiClient();
  const hintGuides = {
    1: {
      focusName: "Geogr\xE1fica (espa\xE7o f\xEDsico, relevo, hemisf\xE9rio e clima)",
      focusInstructions: "Foque em aspectos geogr\xE1ficos f\xEDsicos e de orienta\xE7\xE3o global (como continente, hemisf\xE9rio, bioma, vegeta\xE7\xE3o, relevo, fuso hor\xE1rio ou sentido de fluxo do tr\xE2nsito)."
    },
    2: {
      focusName: "Gastron\xF4mica (culin\xE1ria, pratos e ingredientes tradicionais)",
      focusInstructions: "Foque em pratos t\xEDpicos, temperos ou culin\xE1ria associada a esta heran\xE7a regional, descrevendo sabores ou ingredientes comuns sem revelar o nome do pa\xEDs."
    },
    3: {
      focusName: "Conhecimentos Gerais (marcos, fatos hist\xF3ricos e geopol\xEDticos)",
      focusInstructions: "Foque em fatos de conhecimento geral, eventos de relev\xE2ncia hist\xF3rica ou trivia sutil sobre o local, como fronteiras, economia, moeda ou sufixo nacional de dom\xEDnio."
    },
    4: {
      focusName: "Cultural (estilo de vida, idioma e h\xE1bitos locais)",
      focusInstructions: "Foque na identidade e costumes locais, folclore, caracter\xEDsticas ou som/alfabeto do idioma falado por l\xE1 e tra\xE7os arquitet\xF4nicos residenciais t\xEDpicos."
    }
  };
  const currentGuide = hintGuides[level] || hintGuides[1];
  const systemInstruction = `Voc\xEA \xE9 o mestre de dicas do Guess The Place. Seu objetivo \xE9 ajudar o jogador gerando dicas \xFAteis, intrigantes e realistas baseadas estritamente nos dados de geolocaliza\xE7\xE3o e refer\xEAncias reais fornecidas.

DIRETRIZES R\xCDGIDAS DE SEGURAN\xC7A E N\xC3O ALUCINA\xC7\xC3O:
1. NUNCA revele n\xFAmeros de coordenadas geogr\xE1ficas ou sequ\xEAncias de latitude/longitude (como 48.8, 2.29, etc.).
2. NUNCA mencione explicitamente o nome do pa\xEDs, estado, prov\xEDncia, cidade ou o nome oficial exato da atra\xE7\xE3o tur\xEDstica. Em vez disso, use sempre termos descritivos elegantes (ex: use "este famoso pa\xEDs sul-americano", "esta metr\xF3pole litor\xE2nea", "este imponente pal\xE1cio de ferro").
3. N\xC3O INVENTE FATOS FALSOS OU HIST\xD3RIAS DE FANTASIA. Baseie sua resposta apenas em caracter\xEDsticas geogr\xE1ficas, hist\xF3ricas e culturais genu\xEDnas.
4. Responda em portugu\xEAs brasileiro fluente, correto e natural. Nunca use palavras em ingl\xEAs (como usar "predominant" em vez de "predominante").
5. Conclua SEMPRE todas as frases por completo. NUNCA deixe o texto cortado ou com ideias inacabadas no final.`;
  const prompt = `Escreva em poucas palavras uma dica inteligente de car\xE1ter ${currentGuide.focusName} para o local descrito abaixo, sem revelar o nome do local ou pa\xEDs de forma alguma:

Dados do Local Real:
- Atra\xE7\xE3o Tur\xEDstica: "${placeName}"
- Detalhes: "${description}"
- Continente/Regi\xE3o: ${continent}
- Sentido do Tr\xE2nsito: ${drivingSide}
- Fuso Hor\xE1rio aproximado: ${timezone}
- Moeda Corrente: ${currencyText}
- Dom\xEDnio de Internet Nacional (TLD): ${tld}
- Fronteira Terrestre: ${bordersText}
- Coordenadas Gerais: Latitude ${latitude >= 0 ? "Norte" : "Sul"}, Longitude ${longitude >= 0 ? "Oriental" : "Ocidental"}

Instru\xE7\xF5es Adicionais: ${currentGuide.focusInstructions}
Lembre-se: Escreva apenas um par\xE1grafo curto de no m\xE1ximo 2 a 3 frases objetivas, intrigantes e COMPLETAS. Nunca deixe a \xFAltima frase cortada.`;
  for (const modelId of FREE_BASE_MODELS) {
    try {
      console.log(`[Gemini API] Tentando gerar dica com modelo base gratuito: ${modelId} (N\xEDvel: ${level})`);
      const response = await withTimeout(
        ai.models.generateContent({
          model: modelId,
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.65,
            maxOutputTokens: 800
          }
        }),
        12e3,
        `Timeout do modelo ${modelId}`
      );
      const text = response.text?.trim();
      if (text) {
        return text;
      }
    } catch (err) {
      console.warn(`[Gemini API] Erro ou Timeout com o modelo ${modelId}:`, err.message || err);
    }
  }
  throw new Error("Todos os modelos de IA gratuitos falharam ou excederam o tempo limite.");
}
function safetyFilter(text, wordsToRedact) {
  let filtered = text;
  filtered = filtered.replace(/\b\d{1,3}[.,]\d{1,6}\b/gi, "[COORDENADAS]");
  filtered = filtered.replace(/\d+([.,]\d+)?\s*[°º]?[^\w\s]*(Norte|Sul|Leste|Oeste|N|S|E|W|L)?/gi, "[COORDENADAS]");
  const sortedWords = [...wordsToRedact].filter((w) => w && w.trim().length > 2).map((w) => w.trim()).sort((a, b) => b.length - a.length);
  for (const word of sortedWords) {
    const escaped = word.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\w*\\b`, "gi");
    filtered = filtered.replace(regex, "[REVELADO]");
  }
  return filtered;
}
app.post("/api/hints/fetch", async (req, res) => {
  const { lat, lng, placeName, description, level } = req.body;
  if (!lat || !lng || !level) {
    return res.status(400).json({ error: "Latitude, longitude e n\xEDvel s\xE3o obrigat\xF3rios." });
  }
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  const locDescription = description || "";
  try {
    const address = await fetchAddressDetails(latitude, longitude);
    const rawCountry = address?.country || "Pa\xEDs Secreto";
    const countryCode = address?.country_code || "";
    const rawState = address?.state || address?.region || "";
    const rawCity = address?.city || address?.town || address?.suburb || "";
    let countryDetails = null;
    if (countryCode) {
      countryDetails = await fetchCountryDetails(countryCode);
    }
    const continent = countryDetails?.continents?.[0] || countryDetails?.subregion || "Territ\xF3rio Global";
    const drivingSide = countryDetails?.car?.side === "left" ? "Lado Esquerdo (M\xE3o Inglesa)" : "Lado Direito";
    const timezone = countryDetails?.timezones?.[0] || "UTC / Vari\xE1vel";
    const tld = countryDetails?.tld?.[0] || "N\xE3o listado";
    let currencyText = "N\xE3o dispon\xEDvel";
    if (countryDetails?.currencies) {
      const keys = Object.keys(countryDetails.currencies);
      if (keys.length > 0) {
        const cur = countryDetails.currencies[keys[0]];
        currencyText = `${cur.name} (${cur.symbol || keys[0]})`;
      }
    }
    let bordersText = "Nenhuma fronteira terrestre";
    if (countryDetails?.borders && countryDetails.borders.length > 0) {
      bordersText = `Faz fronteira terrestre com ${countryDetails.borders.length} outro(s) territ\xF3rio(s)`;
    }
    const wordsToRedact = [rawCountry, rawState, rawCity];
    if (countryCode && countryCode.length > 1) {
      wordsToRedact.push(countryCode);
    }
    if (placeName) {
      const parts = placeName.split(/[\s,.'"-]+/);
      for (const part of parts) {
        if (part.length > 2) {
          wordsToRedact.push(part);
        }
      }
    }
    if (rawCountry.toLowerCase().includes("brasil")) {
      wordsToRedact.push("Brasil", "Brazil", "brasileiro", "brasileira", "brasileiros", "brasileiras");
    } else if (rawCountry.toLowerCase().includes("fran\xE7a") || rawCountry.toLowerCase().includes("france")) {
      wordsToRedact.push("Fran\xE7a", "France", "francesa", "franc\xEAs", "franceses", "francesas");
    } else if (rawCountry.toLowerCase().includes("estados unidos") || rawCountry.toLowerCase().includes("united states")) {
      wordsToRedact.push("Estados Unidos", "United States", "USA", "americano", "americana", "americanos", "americanas");
    } else if (rawCountry.toLowerCase().includes("jap\xE3o") || rawCountry.toLowerCase().includes("japan")) {
      wordsToRedact.push("Jap\xE3o", "Japan", "japon\xEAs", "japonesa", "japoneses", "japonesas");
    } else if (rawCountry.toLowerCase().includes("it\xE1lia") || rawCountry.toLowerCase().includes("italy")) {
      wordsToRedact.push("It\xE1lia", "Italy", "italiano", "italiana", "italianos", "italianas");
    } else if (rawCountry.toLowerCase().includes("reino unido") || rawCountry.toLowerCase().includes("united kingdom")) {
      wordsToRedact.push("Reino Unido", "United Kingdom", "UK", "brit\xE2nico", "brit\xE2nica", "brit\xE2nicos", "brit\xE2nicas");
    } else if (rawCountry.toLowerCase().includes("espanha") || rawCountry.toLowerCase().includes("spain")) {
      wordsToRedact.push("Espanha", "Spain", "espanhol", "espanhola", "espanh\xF3is", "espanholas");
    }
    let hintText = "";
    try {
      hintText = await generateGeminiHint(
        level,
        latitude,
        longitude,
        placeName || "Local Secreto",
        locDescription,
        continent,
        drivingSide,
        timezone,
        tld,
        currencyText,
        bordersText
      );
    } catch (geminiErr) {
      console.warn("[Gemini API Hints Fallback] Usando gerador de dicas local seguro:", geminiErr);
      hintText = generateLocalHint(
        level,
        latitude,
        longitude,
        continent,
        drivingSide,
        timezone,
        tld,
        currencyText,
        bordersText
      );
    }
    const filteredHint = safetyFilter(hintText, wordsToRedact);
    return res.json({
      hint: filteredHint,
      country: rawCountry
    });
  } catch (err) {
    console.error("[Fetch Hints Error] Erro:", err);
    return res.status(500).json({ error: "Erro interno ao extrair pistas da internet." });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Servidor Guess The Place] Rodando na porta ${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
