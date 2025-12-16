// bot-worker.js - Para Railway
import { createClient } from '@supabase/supabase-js';
import { Client, GatewayIntentBits } from 'discord.js';
import 'dotenv/config'; // Para cargar variables de entorno

console.log('🚀 Iniciando bot en Railway...');

// Validar variables críticas
const requiredVars = ['DISCORD_TOKEN', 'SUPABASE_URL', 'SUPABASE_KEY', 'STATS_CHANNEL_ID'];
for (const varName of requiredVars) {
  if (!process.env[varName]) {
    console.error(`❌ FALTA la variable: ${varName}`);
    process.exit(1);
  }
}

console.log('✅ Todas las variables están configuradas');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let statsMessage = null;
const UPDATE_INTERVAL = 30000; // 30 segundos

// Manejar errores no capturados
process.on('unhandledRejection', (error) => {
  console.error('❌ Error no manejado:', error);
});

discordClient.once('ready', async () => {
  console.log(`✅ Bot conectado como ${discordClient.user.tag}`);
  console.log(`📊 Canal de stats: ${process.env.STATS_CHANNEL_ID}`);
  
  // Configurar mensaje
  await setupStatsMessage();
  
  // Actualizar periódicamente
  setInterval(updateStatsMessage, UPDATE_INTERVAL);
  
  // Primera actualización
  await updateStatsMessage();
  console.log('🔄 Bot listo y actualizando...');
});

discordClient.on('error', (error) => {
  console.error('❌ Error del cliente Discord:', error);
});

async function setupStatsMessage() {
  try {
    const channel = await discordClient.channels.fetch(process.env.STATS_CHANNEL_ID);
    
    // Si tenemos ID de mensaje, usarlo
    if (process.env.STATS_MESSAGE_ID) {
      try {
        statsMessage = await channel.messages.fetch(process.env.STATS_MESSAGE_ID);
        console.log(`📌 Usando mensaje existente: ${process.env.STATS_MESSAGE_ID}`);
      } catch (error) {
        console.log('⚠️ No se pudo encontrar el mensaje, creando uno nuevo...');
        statsMessage = await createNewMessage(channel);
      }
    } else {
      // Crear nuevo mensaje
      statsMessage = await createNewMessage(channel);
    }
  } catch (error) {
    console.error('❌ Error configurando mensaje:', error);
  }
}

async function createNewMessage(channel) {
  const newMessage = await channel.send('🔄 Inicializando estadísticas...');
  console.log(`📝 NUEVO mensaje creado. ID: ${newMessage.id}`);
  console.log(`💡 IMPORTANTE: Agrega esta variable a Railway:\nSTATS_MESSAGE_ID=${newMessage.id}`);
  return newMessage;
}

async function updateStatsMessage() {
  if (!statsMessage) return;
  
  try {
    const stats = await getLiveStats();
    
    const embed = {
      title: '📊 Estadísticas en Tiempo Real',
      color: 0x00ff00,
      fields: [
        { name: '👥 Usuarios Activos (5min)', value: `**${stats.activeUsers}**`, inline: true },
        { name: '🎯 Total Ejecuciones', value: `**${stats.total.toLocaleString()}**`, inline: true },
        { name: '📅 Hoy', value: `**${stats.daily}**`, inline: true },
        { name: '⏰ Esta Hora', value: `**${stats.hourly}**`, inline: true },
        { name: '🕐 Este Minuto', value: `**${stats.minute}**`, inline: true },
        { name: '🔄 Última Actualización', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
      ],
      footer: {
        text: `Bot Hosteado en Railway • v1.0`
      },
      timestamp: new Date().toISOString()
    };
    
    await statsMessage.edit({
      content: '',
      embeds: [embed]
    });
    
    console.log(`✅ Mensaje actualizado | Activos: ${stats.activeUsers} | Total: ${stats.total}`);
    
  } catch (error) {
    console.error('❌ Error actualizando mensaje:', error);
  }
}

async function getLiveStats() {
  const now = new Date();
  const timeKeys = {
    day: now.toISOString().slice(0, 10),
    hour: now.toISOString().slice(0, 13),
    minute: now.toISOString().slice(0, 16)
  };
  
  try {
    const [totalRes, dailyRes, hourlyRes, minuteRes, activeUsersRes] = await Promise.allSettled([
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
      total: totalRes.status === 'fulfilled' ? (totalRes.value.data || 0) : 0,
      daily: dailyRes.status === 'fulfilled' ? (dailyRes.value.data || 0) : 0,
      hourly: hourlyRes.status === 'fulfilled' ? (hourlyRes.value.data || 0) : 0,
      minute: minuteRes.status === 'fulfilled' ? (minuteRes.value.data || 0) : 0,
      activeUsers: activeUsersRes.status === 'fulfilled' ? (activeUsersRes.value.data?.length || 0) : 0
    };
    
  } catch (error) {
    console.error('Error obteniendo stats:', error);
    return { total: 0, daily: 0, hourly: 0, minute: 0, activeUsers: 0 };
  }
}

// Conectar el bot
console.log('🔗 Conectando a Discord...');
discordClient.login(process.env.DISCORD_TOKEN).catch(console.error);
