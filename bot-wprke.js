// bot-worker.js - Optimizado para Koyeb
import { createClient } from '@supabase/supabase-js';
import { Client, GatewayIntentBits } from 'discord.js';
import express from 'express';

console.log('🤖 Iniciando Discord Stats Bot en Koyeb...');

// Configurar servidor web para health checks
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'online', 
    service: 'discord-stats-bot',
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Discord Stats Bot</title></head>
      <body>
        <h1>🤖 Discord Stats Bot</h1>
        <p>Bot activo y funcionando en Koyeb</p>
        <p>Actualizando estadísticas cada 30 segundos</p>
        <p><a href="/health">Ver estado</a></p>
      </body>
    </html>
  `);
});

// Validar variables de entorno críticas
const requiredEnvVars = ['DISCORD_TOKEN', 'SUPABASE_URL', 'SUPABASE_KEY', 'STATS_CHANNEL_ID'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ ERROR: Variables de entorno faltantes:', missingVars);
  console.error('💡 Ve a Koyeb → Tu App → Environment Variables');
  process.exit(1);
}

console.log('✅ Variables de entorno verificadas');

// Configurar Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  { auth: { persistSession: false } }
);

// Configurar Discord Client
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let statsMessage = null;
let isBotReady = false;
const UPDATE_INTERVAL = 30000; // 30 segundos

// ==================== EVENTOS DEL BOT ====================

discordClient.once('ready', async () => {
  console.log(`🎉 Bot conectado como: ${discordClient.user.tag}`);
  console.log(`🆔 ID del Bot: ${discordClient.user.id}`);
  console.log(`📊 Canal configurado: ${process.env.STATS_CHANNEL_ID}`);
  
  isBotReady = true;
  
  // Configurar mensaje de estadísticas
  await setupStatsMessage();
  
  // Iniciar actualizaciones periódicas
  startUpdateCycle();
  
  console.log('🚀 Bot completamente inicializado y listo');
});

discordClient.on('error', (error) => {
  console.error('⚠️ Error del cliente Discord:', error);
});

// ==================== FUNCIONES PRINCIPALES ====================

async function setupStatsMessage() {
  try {
    const channel = await discordClient.channels.fetch(process.env.STATS_CHANNEL_ID);
    
    // Intentar usar mensaje existente si tenemos ID
    if (process.env.STATS_MESSAGE_ID) {
      try {
        statsMessage = await channel.messages.fetch(process.env.STATS_MESSAGE_ID);
        console.log(`📌 Mensaje existente encontrado: ${process.env.STATS_MESSAGE_ID}`);
      } catch {
        console.log('⚠️ Mensaje no encontrado, creando nuevo...');
        statsMessage = await createNewMessage(channel);
      }
    } else {
      statsMessage = await createNewMessage(channel);
    }
  } catch (error) {
    console.error('❌ Error configurando mensaje:', error.message);
  }
}

async function createNewMessage(channel) {
  const newMessage = await channel.send({
    embeds: [{
      title: '🔄 Inicializando...',
      description: 'El bot se está configurando. Las estadísticas aparecerán pronto.',
      color: 0xFFFF00,
      timestamp: new Date().toISOString()
    }]
  });
  
  console.log(`📝 NUEVO MENSAJE CREADO → ID: ${newMessage.id}`);
  console.log('==========================================');
  console.log('⚠️ IMPORTANTE: Copia este ID y añádelo en Koyeb:');
  console.log(`STATS_MESSAGE_ID=${newMessage.id}`);
  console.log('==========================================');
  
  return newMessage;
}

function startUpdateCycle() {
  // Primera actualización inmediata
  updateStatsMessage();
  
  // Actualizaciones periódicas
  setInterval(async () => {
    if (isBotReady && statsMessage) {
      await updateStatsMessage();
    }
  }, UPDATE_INTERVAL);
  
  console.log(`🔄 Actualizaciones programadas cada ${UPDATE_INTERVAL/1000} segundos`);
}

async function updateStatsMessage() {
  if (!statsMessage) return;
  
  try {
    const stats = await getLiveStats();
    const now = new Date();
    
    const embed = {
      title: `📊 Estadísticas en Tiempo Real • ${now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`,
      color: 0x00FF00,
      fields: [
        {
          name: '👥 Usuarios Activos',
          value: `**${stats.activeUsers}** usuarios`,
          inline: true
        },
        {
          name: '🎯 Total Ejecuciones',
          value: `**${stats.total.toLocaleString('es-ES')}**`,
          inline: true
        },
        {
          name: '📅 Hoy',
          value: `**${stats.daily}** ejecuciones`,
          inline: true
        },
        {
          name: '⏰ Esta Hora',
          value: `**${stats.hourly}** ejecuciones`,
          inline: true
        },
        {
          name: '🕐 Este Minuto',
          value: `**${stats.minute}** ejecuciones`,
          inline: true
        },
        {
          name: '🖥️ Host',
          value: 'Koyeb 🚀',
          inline: true
        }
      ],
      footer: {
        text: 'Actualizado automáticamente • discord.js + Supabase'
      },
      timestamp: now.toISOString()
    };
    
    await statsMessage.edit({ embeds: [embed] });
    
    console.log(`✅ Estadísticas actualizadas | Activos: ${stats.activeUsers} | Total: ${stats.total}`);
    
  } catch (error) {
    console.error('❌ Error actualizando mensaje:', error.message);
  }
}

async function getLiveStats() {
  try {
    const now = new Date();
    const timeKeys = {
      day: now.toISOString().slice(0, 10),
      hour: now.toISOString().slice(0, 13),
      minute: now.toISOString().slice(0, 16)
    };
    
    const [totalRes, dailyRes, hourlyRes, minuteRes, activeUsersRes] = await Promise.all([
      supabase.rpc('get_counter', { counter_name: 'total_executions' }),
      supabase.rpc('get_counter', { counter_name: `executions_day_${timeKeys.day}` }),
      supabase.rpc('get_counter', { counter_name: `executions_hour_${timeKeys.hour}` }),
      supabase.rpc('get_counter', { counter_name: `executions_minute_${timeKeys.minute}` }),
      supabase
        .from('active_users')
        .select('user_id')
        .gte('last_active', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    ]);
    
    return {
      total: totalRes.data || 0,
      daily: dailyRes.data || 0,
      hourly: hourlyRes.data || 0,
      minute: minuteRes.data || 0,
      activeUsers: activeUsersRes.data?.length || 0
    };
    
  } catch (error) {
    console.error('Error obteniendo stats:', error.message);
    return { total: 0, daily: 0, hourly: 0, minute: 0, activeUsers: 0 };
  }
}

// ==================== INICIAR TODO ====================

// Iniciar servidor web
app.listen(PORT, () => {
  console.log(`🌐 Servidor web iniciado en puerto ${PORT}`);
  console.log(`📡 Health check disponible en: http://localhost:${PORT}/health`);
});

// Conectar a Discord
console.log('🔗 Conectando a Discord...');
discordClient.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('❌ Error conectando a Discord:', error.message);
  console.log('💡 Verifica:');
  console.log('   1. El token es correcto');
  console.log('   2. El bot tiene "Message Content Intent" activado');
  console.log('   3. El bot está invitado al servidor');
  process.exit(1);
});
