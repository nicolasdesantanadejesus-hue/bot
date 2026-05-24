const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage
} = require("@whiskeysockets/baileys");

const qrcode = require("qrcode-terminal");
const express = require("express");
const P = require("pino");
const fs = require("fs");
const axios = require("axios");
const yts = require("yt-search");

const app = express();

app.get("/", (req, res) => {
  res.send("SANTANA BOT ONLINE");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 WEB ONLINE");
});

const RAPIDAPI_KEY = "b8b7b39029msh1305aa17e245991p1dc47ajsn5b5e84453827";

const GRUPOS_PERMITIDOS = [
  "Os cria",
  "teste2233"
];

const DB_FILE = "./database.json";

function carregarDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ adv: {} }, null, 2));
  }

  return JSON.parse(fs.readFileSync(DB_FILE));
}

function salvarDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function textoMsg(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    ""
  ).trim();
}

function getQuoted(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;

  if (!ctx?.quotedMessage) return null;

  return {
    key: {
      remoteJid: msg.key.remoteJid,
      fromMe: false,
      id: ctx.stanzaId,
      participant: ctx.participant
    },
    message: ctx.quotedMessage,
    participant: ctx.participant
  };
}

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState("sessao");

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    browser: ["SANTANA BOT", "Chrome", "1.0"],
    printQRInTerminal: true
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async update => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      console.log("📱 ESCANEIE O QR ABAIXO:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "connecting") {
      console.log("🔄 CONECTANDO...");
    }

    if (connection === "open") {
      console.log("✅ SANTANA BOT ONLINE!");
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      console.log("❌ Conexão fechada:", statusCode);

      if (statusCode !== DisconnectReason.loggedOut) {
        setTimeout(() => {
          iniciarBot();
        }, 15000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0];

      if (!msg.message) return;

      const jid = msg.key.remoteJid;

      if (!jid.endsWith("@g.us")) return;

      const sender = msg.key.participant || jid;
      const texto = textoMsg(msg);
      const comando = texto.split(" ")[0].toLowerCase();

      const meta = await sock.groupMetadata(jid);
      const nomeGrupo = meta.subject.trim().toLowerCase();

      const gruposPermitidos = GRUPOS_PERMITIDOS.map(g =>
        g.trim().toLowerCase()
      );

      if (!gruposPermitidos.includes(nomeGrupo)) return;

      const participants = meta.participants;
      const mentions = participants.map(p => p.id);

      const membro = participants.find(p => p.id === sender);

      const isAdmin =
        membro?.admin === "admin" ||
        membro?.admin === "superadmin";

      const reagir = async emoji => {
        await sock.sendMessage(jid, {
          react: {
            text: emoji,
            key: msg.key
          }
        });
      };

      if (comando === "a" || comando === ",a") {
        if (!isAdmin) return reagir("❌");

        await sock.groupSettingUpdate(jid, "not_announcement");
        await reagir("✅");
        return;
      }

      if (comando === "f" || comando === ",f") {
        if (!isAdmin) return reagir("❌");

        await sock.groupSettingUpdate(jid, "announcement");
        await reagir("✅");
        return;
      }

      if (comando === "t" || comando === "totag") {
        if (!isAdmin) return reagir("❌");

        const quoted = getQuoted(msg);

        if (!quoted) {
          await sock.sendMessage(jid, {
            text: "📢 Atenção geral!",
            mentions
          });

          await reagir("✅");
          return;
        }

        const q = quoted.message;

        if (q.conversation || q.extendedTextMessage) {
          const txt = q.conversation || q.extendedTextMessage.text || "";

          await sock.sendMessage(jid, {
            text: txt,
            mentions
          });
        } else if (q.imageMessage) {
          const buffer = await downloadMediaMessage(quoted, "buffer", {});

          await sock.sendMessage(jid, {
            image: buffer,
            caption: q.imageMessage.caption || "",
            mentions
          });
        } else if (q.videoMessage) {
          const buffer = await downloadMediaMessage(quoted, "buffer", {});

          await sock.sendMessage(jid, {
            video: buffer,
            caption: q.videoMessage.caption || "",
            mentions
          });
        } else if (q.audioMessage) {
          const buffer = await downloadMediaMessage(quoted, "buffer", {});

          await sock.sendMessage(jid, {
            audio: buffer,
            mimetype: "audio/mp4",
            ptt: q.audioMessage.ptt || false,
            mentions
          });
        }

        await reagir("✅");
        return;
      }

      if (texto.toLowerCase().startsWith(",play ")) {
        const pesquisa = texto.slice(6).trim();

        if (!pesquisa) return;

        try {
          await reagir("🎵");

          const resultado = await yts(pesquisa);
          const video = resultado.videos[0];

          if (!video) {
            await sock.sendMessage(jid, {
              text: "❌ Música não encontrada."
            });

            return;
          }

          await sock.sendMessage(jid, {
            text:
`╔══════════════════╗
      🎵 SANTANA PLAY 🎵
╚══════════════════╝

⏳ BAIXANDO ÁUDIO...

📌 ${video.title}

👀 Canal:
${video.author.name}

⏱️ Duração:
${video.timestamp}

🔥 Aguarde alguns segundos...`
          });

          const resposta = await axios.get(
            `https://youtube-mp36.p.rapidapi.com/dl?id=${video.videoId}`,
            {
              headers: {
                "Content-Type": "application/json",
                "x-rapidapi-host": "youtube-mp36.p.rapidapi.com",
                "x-rapidapi-key": RAPIDAPI_KEY
              }
            }
          );

          const audioUrl = resposta.data?.link;

          if (!audioUrl) {
            await sock.sendMessage(jid, {
              text: "❌ API OFFLINE"
            });

            return;
          }

          const audioData = await axios.get(audioUrl, {
            responseType: "arraybuffer",
            headers: {
              "User-Agent": "Mozilla/5.0"
            }
          });

          const audioBuffer = Buffer.from(audioData.data);

          await sock.sendMessage(jid, {
            audio: audioBuffer,
            mimetype: "audio/mpeg",
            ptt: false,
            fileName: `${video.title}.mp3`
          });

          await reagir("✅");
        } catch (e) {
          console.log("ERRO PLAY:", e.response?.data || e.message);

          await sock.sendMessage(jid, {
            text:
`╔══════════════════╗
❌ ERRO AO BAIXAR
╚══════════════════╝

⚠️ Verifique se a API está assinada na RapidAPI.`
          });

          await reagir("❌");
        }

        return;
      }

      if (
        texto.toLowerCase().startsWith(",tiktok ") ||
        texto.toLowerCase().startsWith(",tt ")
      ) {
        const link = texto
          .replace(",tiktok", "")
          .replace(",tt", "")
          .trim();

        if (!link) return;

        try {
          await sock.sendMessage(jid, {
            text: "📥 BAIXANDO TIKTOK..."
          });

          const resposta = await axios.get(
            `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`
          );

          const video = resposta.data?.data?.play;

          if (!video) {
            await reagir("❌");
            return;
          }

          await sock.sendMessage(jid, {
            video: {
              url: video
            },
            mimetype: "video/mp4",
            caption: "✅ TIKTOK BAIXADO"
          });

          await reagir("✅");
        } catch (e) {
          console.log("ERRO TIKTOK:", e.response?.data || e.message);
          await reagir("❌");
        }

        return;
      }

      if (texto.toLowerCase().startsWith(",add ")) {
        if (!isAdmin) return reagir("❌");

        let numero = texto
          .replace(",add", "")
          .replace(/\D/g, "")
          .trim();

        if (!numero) {
          await sock.sendMessage(jid, {
            text: "❌ Use assim: ,add 5571999999999"
          });
          return;
        }

        if (!numero.startsWith("55")) {
          numero = "55" + numero;
        }

        const alvo = numero + "@s.whatsapp.net";

        try {
          await sock.groupParticipantsUpdate(jid, [alvo], "add");

          await sock.sendMessage(jid, {
            text: `✅ Membro adicionado:\n${numero}`
          });

          await reagir("✅");
        } catch (e) {
          try {
            const codigo = await sock.groupInviteCode(jid);
            const link = `https://chat.whatsapp.com/${codigo}`;

            await sock.sendMessage(alvo, {
              text:
`👋 Você foi convidado para entrar no grupo:

${link}`
            });

            await sock.sendMessage(jid, {
              text:
`⚠️ Não consegui adicionar direto.

✅ Link enviado no privado.`
            });

            await reagir("✅");
          } catch (err) {
            await sock.sendMessage(jid, {
              text: "❌ Não consegui adicionar nem enviar link."
            });

            await reagir("❌");
          }
        }

        return;
      }

      if (comando === ",menuadm") {
        if (!isAdmin) return;

        await sock.sendMessage(sender, {
          text:
`🤖 MENU ADM

🔓 a / ,a
🔒 f / ,f
📢 t / totag

🎵 ,play nome da música
📥 ,tiktok link
📥 ,tt link
➕ ,add número

🚫 ,ban
📥 ,aceitar
🗑️ d / ,d`
        });

        return;
      }
    } catch (err) {
      console.log("❌ ERRO:", err);
    }
  });
}

iniciarBot();

process.stdin.resume();