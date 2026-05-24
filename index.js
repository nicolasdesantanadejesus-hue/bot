const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const P = require("pino");
const fs = require("fs");
const axios = require("axios");
const yts = require("yt-search");

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

function temLinkOuStatus(texto, msg) {
  const t = texto.toLowerCase();

  const linkLiberado =
    t.includes("tiktok.com") ||
    t.includes("vm.tiktok.com") ||
    t.includes("vt.tiktok.com") ||
    t.includes("instagram.com") ||
    t.includes("instagr.am");

  const temLink =
    /(https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,})(\/\S*)?/i.test(texto);

  const temMencaoStatus =
    msg.message?.groupStatusMentionMessage ||
    msg.message?.statusMentionMessage ||
    msg.message?.protocolMessage?.type === 25;

  if (linkLiberado) return temMencaoStatus;

  return temLink || temMencaoStatus;
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
    browser: ["SANTANA BOT", "Chrome", "1.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", update => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      console.log("📱 Escaneie o QR:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ SANTANA BOT ONLINE!");
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log("❌ Conexão fechada:", code);

      if (code !== DisconnectReason.loggedOut) {
        iniciarBot();
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

      if (temLinkOuStatus(texto, msg)) {
        if (!isAdmin) {
          await sock.sendMessage(jid, {
            text: "🚫 Link ou menção de status detectado."
          });

          try {
            await sock.sendMessage(jid, {
              delete: msg.key
            });
          } catch {}

          await reagir("🚫");
          return;
        }
      }

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

      if (comando === "t" || comando === "totag" || comando === "t+totag") {
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

      if (comando === ",fig" || comando === "fig" || comando === ",sticker") {
        const quoted = getQuoted(msg);

        if (!quoted) return reagir("❌");

        const q = quoted.message;

        if (q.imageMessage) {
          try {
            const buffer = await downloadMediaMessage(quoted, "buffer", {});

            const sticker = new Sticker(buffer, {
              pack: "SANTANA BOT",
              author: "X4",
              type: StickerTypes.FULL,
              quality: 100
            });

            const stickerBuffer = await sticker.toBuffer();

            await sock.sendMessage(jid, {
              sticker: stickerBuffer
            });

            await reagir("✅");
          } catch (e) {
            console.log("ERRO FIG IMAGEM:", e);
            await reagir("❌");
          }

          return;
        }

        if (q.videoMessage && q.videoMessage.seconds <= 10) {
          try {
            const buffer = await downloadMediaMessage(quoted, "buffer", {});

            const sticker = new Sticker(buffer, {
              pack: "SANTANA BOT",
              author: "X4",
              type: StickerTypes.FULL,
              quality: 100
            });

            const stickerBuffer = await sticker.toBuffer();

            await sock.sendMessage(jid, {
              sticker: stickerBuffer
            });

            await reagir("✅");
          } catch (e) {
            console.log("ERRO FIG VIDEO:", e);
            await reagir("❌");
          }

          return;
        }

        await reagir("❌");
        return;
      }

      if (comando.startsWith(",ban")) {
        if (!isAdmin) return reagir("❌");

        const quoted = getQuoted(msg);
        let alvo = quoted?.participant;

        if (!alvo && msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
          alvo = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
        }

        if (!alvo) return reagir("❌");

        await sock.groupParticipantsUpdate(jid, [alvo], "remove");
        await reagir("✅");
        return;
      }

      if (comando === ",aceitar") {
        if (!isAdmin) return reagir("❌");

        try {
          const pedidos = await sock.groupRequestParticipantsList(jid);

          if (pedidos.length > 0) {
            const ids = pedidos.map(p => p.jid);
            await sock.groupRequestParticipantsUpdate(jid, ids, "approve");
          }

          await reagir("✅");
        } catch (e) {
          console.log("ERRO ACEITAR:", e);
          await reagir("❌");
        }

        return;
      }

      if (comando === ",s") {
        if (!isAdmin) return reagir("❌");

        for (let i = 1; i <= 8; i++) {
          await sock.sendMessage(jid, {
            text:
`╔══════════════════╗
      ⚡ 𝗦𝗔𝗡𝗧𝗔𝗡𝗔 𝗕𝗢𝗧 ⚡
╚══════════════════╝

╭━━〔 🚨 𝗣𝗨𝗫𝗔𝗡𝗗𝗢 𝗦𝗔𝗟𝗔 🚨 〕━━╮

🎮 𝗦𝗮𝗹𝗮 𝗹𝗶𝗯𝗲𝗿𝗮𝗱𝗮!
📢 𝗥𝗲𝗮𝗴𝗮 𝗮 𝗲𝗻𝗾𝘂𝗲𝘁𝗲!
🔥 𝗠𝗼𝗱𝗼: X4

⚔️ 𝗣𝗹𝗮𝘆𝗲𝗿𝘀:
『 ${i}/8 』

╰━━━━━━━━━━━━━━━━━━╯`,
            mentions
          });

          await new Promise(resolve => setTimeout(resolve, 1200));
        }

        await sock.sendMessage(jid, {
          poll: {
            name: "🎮 PLAYER ONLINE",
            values: ["✅ ONLINE", "❌ OFFLINE"],
            selectableCount: 1
          }
        });

        await reagir("✅");
        return;
      }

      if (comando.startsWith(",adv")) {
        if (!isAdmin) return reagir("❌");

        const quoted = getQuoted(msg);
        let alvo = quoted?.participant;

        if (!alvo && msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
          alvo = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
        }

        if (!alvo) return reagir("❌");

        const db = carregarDB();

        if (!db.adv[jid]) db.adv[jid] = {};
        if (!db.adv[jid][alvo]) db.adv[jid][alvo] = 0;

        db.adv[jid][alvo]++;
        salvarDB(db);

        const total = db.adv[jid][alvo];

        await sock.sendMessage(jid, {
          text:
`⚠️ 𝗔𝗗𝗩𝗘𝗥𝗧𝗘̂𝗡𝗖𝗜𝗔 ⚠️

👤 Membro advertido

🚫 Advertências:
${total}/3

⚡ Ao atingir 3/3 o membro será removido automaticamente.`
        });

        if (total >= 3) {
          await sock.groupParticipantsUpdate(jid, [alvo], "remove");

          db.adv[jid][alvo] = 0;
          salvarDB(db);
        }

        await reagir("✅");
        return;
      }

      if (comando.startsWith(",tiraradv")) {
        if (!isAdmin) return reagir("❌");

        const quoted = getQuoted(msg);
        let alvo = quoted?.participant;

        if (!alvo && msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
          alvo = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
        }

        if (!alvo) return reagir("❌");

        const db = carregarDB();

        if (!db.adv[jid]) db.adv[jid] = {};
        if (!db.adv[jid][alvo]) db.adv[jid][alvo] = 0;

        if (db.adv[jid][alvo] > 0) {
          db.adv[jid][alvo]--;
        }

        salvarDB(db);

        await sock.sendMessage(jid, {
          text: "✅ Advertência removida."
        });

        await reagir("✅");
        return;
      }

      if (comando === "d" || comando === ",d") {
        if (!isAdmin) return reagir("❌");

        const quoted = getQuoted(msg);

        if (!quoted) return reagir("❌");

        try {
          await sock.sendMessage(jid, {
            delete: quoted.key
          });

          await reagir("✅");
        } catch (e) {
          console.log("ERRO DELETE:", e);
          await reagir("❌");
        }

        return;
      }

      if (
        comando === "linkgp" ||
        comando === ",linkgp" ||
        comando === "link" ||
        comando === ",link"
      ) {
        if (!isAdmin) return reagir("❌");

        try {
          const codigo = await sock.groupInviteCode(jid);
          const link = `https://chat.whatsapp.com/${codigo}`;

          if (fs.existsSync("./grupo.jpg")) {
            await sock.sendMessage(jid, {
              image: fs.readFileSync("./grupo.jpg"),
              caption:
`🚀 𝗘𝗡𝗧𝗥𝗘 𝗡𝗢 𝗚𝗥𝗨𝗣𝗢

📋 𝗟𝗜𝗡𝗞:

${link}

⚡ 𝗦𝗔𝗡𝗧𝗔𝗡𝗔 𝗕𝗢𝗧`
            });
          } else {
            await sock.sendMessage(jid, {
              text:
`🚀 𝗘𝗡𝗧𝗥𝗘 𝗡𝗢 𝗚𝗥𝗨𝗣𝗢

📋 𝗟𝗜𝗡𝗞:

${link}

⚡ 𝗦𝗔𝗡𝗧𝗔𝗡𝗔 𝗕𝗢𝗧`
            });
          }

          await reagir("✅");
        } catch (e) {
          console.log("ERRO LINKGP:", e);
          await reagir("❌");
        }

        return;
      }

      // PLAY LIBERADO PARA MEMBROS
      if (texto.toLowerCase().startsWith(",play ")) {
        const pesquisa = texto.slice(6).trim();

        if (!pesquisa) return reagir("❌");

        try {
          const resultado = await yts(pesquisa);
          const video = resultado.videos[0];

          if (!video) return reagir("❌");

          await sock.sendMessage(jid, {
            text:
`🎵 BAIXANDO ÁUDIO...

🎧 ${video.title}`
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
              text: "❌ API de áudio indisponível no momento."
            });

            await reagir("❌");
            return;
          }

          await sock.sendMessage(jid, {
            audio: {
              url: audioUrl
            },
            mimetype: "audio/mpeg",
            ptt: false,
            fileName: `${video.title}.mp3`
          });

          await reagir("✅");
        } catch (e) {
          console.log("ERRO PLAY:", e.response?.data || e.message);

          await sock.sendMessage(jid, {
            text:
`❌ Erro ao baixar música.

Se aparecer "You are not subscribed to this API", sua RapidAPI não está liberada.`
          });

          await reagir("❌");
        }

        return;
      }

      // TIKTOK LIBERADO PARA MEMBROS
      if (
        texto.toLowerCase().startsWith(",tiktok ") ||
        texto.toLowerCase().startsWith(",tt ")
      ) {
        const link = texto
          .replace(",tiktok", "")
          .replace(",tt", "")
          .trim();

        if (!link) return reagir("❌");

        try {
          await sock.sendMessage(jid, {
            text: "📥 BAIXANDO TIKTOK..."
          });

          const resposta = await axios.get(
            `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`,
            {
              headers: {
                "Content-Type": "application/json",
                "x-rapidapi-key": RAPIDAPI_KEY
              }
            }
          );

          const video = resposta.data?.data?.play;

          if (!video) return reagir("❌");

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

// ADD MEMBRO OU ENVIA LINK SE FALHAR
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
      text: `✅ Membro adicionado: ${numero}`
    });

    await reagir("✅");
  } catch (e) {
    console.log("ERRO ADD:", e?.output || e);

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

✅ Enviei o link do grupo no privado para:
${numero}`
      });

      await reagir("✅");
    } catch (err) {
      console.log("ERRO ENVIAR LINK:", err);

      await sock.sendMessage(jid, {
        text:
`❌ Não consegui adicionar nem enviar o link.

Verifique:
- número correto
- bot é admin
- pessoa permite receber mensagem`
      });

      await reagir("❌");
    }
  }

  return;
}
      if (comando === ",menuadm") {
        if (!isAdmin) return reagir("❌");

        await sock.sendMessage(sender, {
          text:
`🤖 MENU ADM 🤖

🔓 a / ,a
🔒 f / ,f

📢 t / totag
🖼️ ,fig

🎵 ,play nome da música
📥 ,tiktok link
📥 ,tt link

🚫 ,ban
📥 ,aceitar

🚨 ,s

⚠️ ,adv
🧹 ,tiraradv

🗑️ d / ,d
🔗 ,linkgp`
        });

        await reagir("✅");
        return;
      }

    } catch (err) {
      console.log("❌ ERRO:", err);
    }
  });
}

iniciarBot();

process.stdin.resume();