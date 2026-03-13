
const {Client, GatewayIntentBits, SlashCommandBuilder, Routes, REST} = require('discord.js')
const sqlite3 = require('sqlite3')
const cron = require('node-cron')
const express = require('express')
const config = require('./config.json')

const client = new Client({intents:[GatewayIntentBits.Guilds]})
const db = new sqlite3.Database('./database.db')

db.run("CREATE TABLE IF NOT EXISTS duty (userId TEXT, start INTEGER)")
db.run("CREATE TABLE IF NOT EXISTS hours (userId TEXT, seconds INTEGER)")
db.run("CREATE TABLE IF NOT EXISTS logs (userId TEXT, command TEXT, date INTEGER)")

function isZarzad(member){
 return member.roles.cache.has(config.zarzadRole)
}

client.on("ready",()=>{
 console.log("Bot online")
})

client.on("interactionCreate", async interaction=>{

 if(!interaction.isChatInputCommand()) return

 const member = interaction.member

 if(!isZarzad(member)){
  return interaction.reply({content:"Brak uprawnień",ephemeral:true})
 }

 db.run("INSERT INTO logs VALUES (?,?,?)",[member.user.id,interaction.commandName,Date.now()])

 if(interaction.commandName==="duty"){
  db.run("INSERT INTO duty VALUES (?,?)",[member.user.id,Date.now()])
  interaction.reply("Rozpocząłeś służbę")
 }

 if(interaction.commandName==="offduty"){
  db.get("SELECT * FROM duty WHERE userId=?",[member.user.id],(e,row)=>{
   if(!row) return interaction.reply("Nie jesteś na służbie")

   const diff = Math.floor((Date.now()-row.start)/1000)
   db.run("DELETE FROM duty WHERE userId=?",[member.user.id])
   db.run("INSERT INTO hours VALUES (?,?)",[member.user.id,diff])

   interaction.reply("Służba zakończona")
  })
 }

})

cron.schedule("0 20 * * 6",()=>{
 db.all("SELECT * FROM hours",(e,rows)=>{

  let msg="PODSUMOWANIE TYGODNIA\n"

  rows.forEach(r=>{
   msg+=`<@${r.userId}> - ${Math.floor(r.seconds/3600)}h\n`
  })

  const ch = client.channels.cache.get(config.summaryChannel)
  if(ch) ch.send(msg)

 })
})

const commands=[
 new SlashCommandBuilder().setName("duty").setDescription("Rozpocznij służbę"),
 new SlashCommandBuilder().setName("offduty").setDescription("Zakończ służbę")
].map(c=>c.toJSON())

const rest = new REST({version:"10"}).setToken(config.token)

async function deploy(){
 await rest.put(
  Routes.applicationGuildCommands("CLIENT_ID",config.guildId),
  {body:commands}
 )
}

deploy()

client.login(config.token)

// PANEL WWW

const app = express()

app.get("/",(req,res)=>{
 db.all("SELECT userId, SUM(seconds) as total FROM hours GROUP BY userId",(e,rows)=>{

  let html="<h1>Panel godzin pracowników</h1>"

  rows.forEach(r=>{
   html+=`<p>${r.userId} - ${Math.floor(r.total/3600)}h</p>`
  })

  res.send(html)

 })
})

app.listen(config.panelPort,()=>{
 console.log("Panel działa na porcie "+config.panelPort)
})
