require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const fetch = require('node-fetch');

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_IDS = process.env.CHANNEL_IDS ? process.env.CHANNEL_IDS.split(',') : [];
const PORT = process.env.SERVER_PORT || 3000;

if (!TOKEN) throw new Error("DISCORD_TOKEN não definido no .env");
if (CHANNEL_IDS.length === 0) throw new Error("CHANNEL_IDS não definido no .env");

const app = express();
app.use(express.json());

let receivedEmbeds = [];

// 🧹 Limpa embeds com mais de 6 minutos
function cleanOldEmbeds() {
    const now = Date.now();
    receivedEmbeds = receivedEmbeds.filter(e => now - e.timestamp < 6 * 60 * 1000);
}

// 📥 Endpoint para receber embeds
app.post('/pets', (req, res) => {
    if (!req.body || !req.body.embeds) return res.sendStatus(400);

    const now = Date.now();
    req.body.embeds.forEach(embed => {
        const desc = embed.description || '';
        const data = { timestamp: now };

        // --- Parsing de campos principais ---
        const lines = desc.split('\n');
        lines.forEach(line => {
            if (line.startsWith("🏷️")) data.name = line.replace(/🏷️ \*\*Name:\*\* /, '');
            if (line.startsWith("💰")) data.value = line.replace(/💰 \*\*Money per sec:\*\* /, '');
            if (line.startsWith("👥")) data.players = line.replace(/👥 \*\*Players:\*\* /, '');
            if (line.startsWith("🧬")) data.mutation = line.replace(/🧬 \*\*Mutation:\*\* /, '');
            if (line.startsWith("🎭")) data.traits = line.replace(/🎭 \*\*Traits:\*\* /, '');
        });

        // --- Captura Place ID e Job ID no formato simples ---
        const placeMatch = desc.match(/Place ID:\s*(\d+)/i);
        if (placeMatch) data.placeId = placeMatch[1];

        const jobMatch = desc.match(/Job ID:\s*([a-zA-Z0-9-]+)/i);
        if (jobMatch) data.jobId = jobMatch[1];

        // --- Quick Join ---
        const quickJoinMatch = desc.match(/placeId=(\d+)&gameInstanceId=([a-zA-Z0-9-]+)/i);
        if (quickJoinMatch) {
            data.placeId = quickJoinMatch[1];
            data.jobId = quickJoinMatch[2];
            data.quickJoinUrl = `https://obritadavilindo-tech.github.io/Krxreimyquickjoin/?placeId=${data.placeId}&gameInstanceId=${data.jobId}`;
        }

        // --- Script Teleport ---
        const scriptJoinMatch = desc.match(/TeleportToPlaceInstance\((\d+), '([a-zA-Z0-9-]+)'/);
        if (scriptJoinMatch) {
            data.placeId = scriptJoinMatch[1];
            data.jobId = scriptJoinMatch[2];
        }

        // --- Outras infos ---
        data.title = embed.title || '';
        data.color = embed.color || 0;
        data.thumbnail = embed.thumbnail ? embed.thumbnail.url : '';
        data.footer = embed.footer ? embed.footer.text : '';

        receivedEmbeds.push(data);
    });

    cleanOldEmbeds();
    console.log(`[💻] Novo embed recebido. Total armazenados: ${receivedEmbeds.length}`);
    res.sendStatus(200);
});

// 🌐 Página HTML
app.get('/', (req, res) => {
    cleanOldEmbeds();

    let html = `
    <html>
    <head>
        <title>Received Pets</title>
        <style>
            body { font-family: Arial, sans-serif; background:#121212; color:#eee; margin:20px; }
            .pet { border:1px solid #333; padding:12px; margin:12px 0; border-radius:10px; background:#1e1e1e; }
            .pet img { float:right; max-width:100px; border-radius:6px; }
            h2 { margin:0; font-size:18px; color:#ffd700; }
            p { margin:2px 0; }
            a { color:#4ea3ff; text-decoration:none; }
        </style>
    </head>
    <body>
        <h1>📦 Received Pets</h1>
    `;

    const sortedEmbeds = receivedEmbeds.sort((a, b) => b.timestamp - a.timestamp);

    sortedEmbeds.forEach(pet => {
        html += `
        <div class="pet">
            <img src="${pet.thumbnail}" />
            <h2>${pet.title}</h2>
            <p><b>Name:</b> ${pet.name || 'N/A'}</p>
            <p><b>Value:</b> ${pet.value || 'N/A'}</p>
            <p><b>Players:</b> ${pet.players || 'N/A'}</p>
            <p><b>Mutation:</b> ${pet.mutation || 'N/A'}</p>
            <p><b>Traits:</b> ${pet.traits || 'N/A'}</p>
            <p><b>Place ID:</b> ${pet.placeId || 'N/A'}</p>
            <p><b>Job ID:</b> ${pet.jobId || 'N/A'}</p>
            ${pet.quickJoinUrl ? `<p>🚀 <a href="${pet.quickJoinUrl}" target="_blank">Quick Join</a></p>` : ''}
            <p><small>${pet.footer || ''}</small></p>
        </div>`;
    });

    html += `</body></html>`;
    res.send(html);
});

// 📤 Endpoint JSON
app.get('/latest-pets', (req, res) => {
    cleanOldEmbeds();
    const sortedEmbeds = receivedEmbeds.sort((a, b) => b.timestamp - a.timestamp);
    res.json(sortedEmbeds);
});

// 🚀 Inicia servidor
app.listen(PORT, "0.0.0.0", () => console.log(`[✅] Server running at http://localhost:${PORT}`));

// ---------------- Discord Bot ----------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const sentMessages = new Set();

async function processMessage(msg) {
    if (!msg.embeds || msg.embeds.length === 0) return;
    if (sentMessages.has(msg.id)) return;

    try {
        await fetch(`http://localhost:${PORT}/pets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: msg.embeds })
        });
        console.log(`[✅] Embed enviado ao servidor: ${msg.id}`);
        sentMessages.add(msg.id);
    } catch (err) {
        console.error("[❌] Falha ao enviar embed:", err.message);
    }
}

client.on('messageCreate', msg => {
    if (!CHANNEL_IDS.includes(msg.channelId)) return;
    processMessage(msg);
});

client.once('ready', () => console.log(`[✅] Bot logado como ${client.user.tag}`));
client.login(TOKEN);
