require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const fetch = require('node-fetch'); // garanta que 'node-fetch' está instalado

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_IDS = process.env.CHANNEL_IDS ? process.env.CHANNEL_IDS.split(',') : []; // array de IDs
const PORT = process.env.SERVER_PORT || 3000;

if (!TOKEN) throw new Error("DISCORD_TOKEN não definido no .env");
if (CHANNEL_IDS.length === 0) throw new Error("CHANNEL_IDS não definido no .env");

const app = express();
app.use(express.json());

let receivedEmbeds = []; // manter na memória

// Limpa embeds com mais de 6 minutos
function cleanOldEmbeds() {
    const now = Date.now();
    receivedEmbeds = receivedEmbeds.filter(e => now - e.timestamp < 6 * 60 * 1000);
}

// Endpoint para receber embeds
app.post('/pets', (req, res) => {
    if (!req.body || !req.body.embeds) return res.sendStatus(400);

    const now = Date.now();
    req.body.embeds.forEach(embed => {
        const desc = embed.description || '';
        const data = { timestamp: now };

        const lines = desc.split('\n');
        lines.forEach((line, i) => {
            if (line.startsWith("🏷️")) data.name = line.replace(/🏷️ \*\*Name:\*\* /, '');
            if (line.startsWith("💰")) data.value = line.replace(/💰 \*\*Money per sec:\*\* /, '');
            if (line.startsWith("👥")) data.players = line.replace(/👥 \*\*Players:\*\* /, '');
            if (line.startsWith("🗺")) data.region = line.replace(/🗺 \*\*Region:\*\* /, '');
            if (line.startsWith("🧬")) data.mutation = line.replace(/🧬 \*\*Mutation:\*\* /, '');
            if (line.startsWith("🎭")) data.traits = line.replace(/🎭 \*\*Traits:\*\* /, '');
            if (line.startsWith("📱 Mobile Job")) data.mobileJob = lines[i+1].replace(/```/, '');
            if (line.startsWith("💻 PC Job")) data.pcJob = lines[i+1].replace(/```/, '');
        });

        data.title = embed.title || '';
        data.color = embed.color || 0;
        data.thumbnail = embed.thumbnail ? embed.thumbnail.url : '';
        data.footer = embed.footer ? embed.footer.text : '';

        receivedEmbeds.push(data);
    });

    cleanOldEmbeds();
    console.log(`[💻] Novo embed recebido. Total: ${receivedEmbeds.length}`);
    res.sendStatus(200);
});

// Página HTML com embeds mais recentes no topo
app.get('/', (req, res) => {
    cleanOldEmbeds();

    let html = `
    <html>
    <head>
        <title>Received Pets</title>
        <style>
            body { font-family: Arial, sans-serif; background:#121212; color:#eee; }
            .pet { border:1px solid #444; padding:10px; margin:10px; border-radius:8px; background:#1e1e1e; }
            .pet img { float:right; max-width:100px; }
            h2 { margin:0; }
            p { margin:2px 0; }
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
            <p><b>Name:</b> ${pet.name}</p>
            <p><b>Value:</b> ${pet.value}</p>
            <p><b>Players:</b> ${pet.players}</p>
            <p><b>Region:</b> ${pet.region}</p>
            <p><b>Mutation:</b> ${pet.mutation}</p>
            <p><b>Traits:</b> ${pet.traits}</p>
            <p><b>Mobile Job:</b> ${pet.mobileJob}</p>
            <p><b>PC Job:</b> ${pet.pcJob}</p>
            <p><small>${pet.footer}</small></p>
        </div>`;
    });

    html += `</body></html>`;
    res.send(html);
});

// Endpoint JSON dos últimos embeds, mais recentes primeiro
app.get('/latest-pets', (req, res) => {
    cleanOldEmbeds();
    const sortedEmbeds = receivedEmbeds.sort((a, b) => b.timestamp - a.timestamp);
    res.json(sortedEmbeds);
});

// Inicia servidor
app.listen(PORT, () => console.log(`[✅] Server running at http://localhost:${PORT}`));

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
    if (!CHANNEL_IDS.includes(msg.channelId)) return; // verifica múltiplos canais
    processMessage(msg);
});

client.once('ready', () => console.log(`[✅] Bot logado como ${client.user.tag}`));
client.login(TOKEN);
