// src/app/api/seed/route.ts
import { sql } from '@/lib/neon';
import { NextResponse } from 'next/server';

const predefinedTemplates = [
  {
    title: "Tips pentru Consultație Gratuită",
    service: "Consultație gratuită",
    content: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden; }
          .header { background: linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%); padding: 40px 30px; text-align: center; color: white; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { padding: 40px 30px; }
          .greeting { font-size: 16px; color: #333; margin-bottom: 20px; }
          .info-box { background: #f8f9fa; border-left: 4px solid #FF6B35; padding: 20px; margin: 25px 0; border-radius: 8px; }
          .footer { background: #f5f5f5; padding: 20px 30px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Tips pentru Îngrijirea Dintilor</h1>
            <p>După consultația gratuită</p>
          </div>
          <div class="content">
            <p class="greeting">Draga {{name}},</p>
            <p>Mulțumim pentru vizita la clinica noastră! Iată câteva tips esențiale pentru menținerea sănătății dentare:</p>
            <div class="info-box">
              <ul>
                <li>Periați dinții de două ori pe zi, timp de 2 minute</li>
                <li>Folosiți ața dentară zilnic</li>
                <li>Vizitați dentistul regulat, la fiecare 6 luni</li>
                <li>Evitați alimentele și băuturile dulci</li>
              </ul>
            </div>
            <p>Suntem aici să vă ajutăm să aveți un zâmbet sănătos!</p>
          </div>
          <div class="footer">
            <p>Chelement Dental | Strada Gării nr.9, Baia Mare</p>
          </div>
        </div>
      </body>
      </html>
    `
  },
  {
    title: "Îngrijire după Implant Dentar",
    service: "Implant dentar",
    content: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden; }
          .header { background: linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%); padding: 40px 30px; text-align: center; color: white; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { padding: 40px 30px; }
          .greeting { font-size: 16px; color: #333; margin-bottom: 20px; }
          .info-box { background: #f8f9fa; border-left: 4px solid #FF6B35; padding: 20px; margin: 25px 0; border-radius: 8px; }
          .footer { background: #f5f5f5; padding: 20px 30px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Îngrijire după Implant Dentar</h1>
            <p>Indicații pentru recuperare</p>
          </div>
          <div class="content">
            <p class="greeting">Draga {{name}},</p>
            <p>Implantul dumneavoastră dentar a fost plasat cu succes! Pentru o recuperare optimă, urmați aceste indicații:</p>
            <div class="info-box">
              <h3>Primele 24 de ore:</h3>
              <ul>
                <li>Evitați să mestecați din partea implantului</li>
                <li>Aplicați comprese reci pentru a reduce umflarea</li>
                <li>Luați analgezicele prescrise</li>
              </ul>
              <h3>Îngrijire zilnică:</h3>
              <ul>
                <li>Clătiți cu apă sărată călduță</li>
                <li>Periați ușor zona implantului</li>
                <li>Evitați fumatul și alcoolul</li>
              </ul>
            </div>
            <p>Programați-vă pentru controale regulate. Suntem aici pentru dumneavoastră!</p>
          </div>
          <div class="footer">
            <p>Chelement Dental | Strada Gării nr.9, Baia Mare</p>
          </div>
        </div>
      </body>
      </html>
    `
  },
  // Add more for other services...
  {
    title: "Îngrijire Fațete E-max",
    service: "Fațete E-max",
    content: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden; }
          .header { background: linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%); padding: 40px 30px; text-align: center; color: white; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { padding: 40px 30px; }
          .greeting { font-size: 16px; color: #333; margin-bottom: 20px; }
          .info-box { background: #f8f9fa; border-left: 4px solid #FF6B35; padding: 20px; margin: 25px 0; border-radius: 8px; }
          .footer { background: #f5f5f5; padding: 20px 30px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Îngrijire Fațete E-max</h1>
            <p>Tips pentru longevitatea fațetelor</p>
          </div>
          <div class="content">
            <p class="greeting">Draga {{name}},</p>
            <p>Fațetele dumneavoastră E-max sunt acum gata! Pentru a le menține frumoase și sănătoase:</p>
            <div class="info-box">
              <ul>
                <li>Evitați mușcatul obiectelor dure</li>
                <li>Folosiți periuțe moi și pastă non-abrazivă</li>
                <li>Purtați gutiera de noapte dacă este recomandată</li>
                <li>Vizitați clinica pentru controale regulate</li>
              </ul>
            </div>
            <p>Fațetele dumneavoastră vor străluci ani de zile cu îngrijire corespunzătoare!</p>
          </div>
          <div class="footer">
            <p>Chelement Dental | Strada Gării nr.9, Baia Mare</p>
          </div>
        </div>
      </body>
      </html>
    `
  },
  {
    title: "Îngrijire Invisalign",
    service: "Invisalign / Gutiere",
    content: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden; }
          .header { background: linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%); padding: 40px 30px; text-align: center; color: white; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { padding: 40px 30px; }
          .greeting { font-size: 16px; color: #333; margin-bottom: 20px; }
          .info-box { background: #f8f9fa; border-left: 4px solid #FF6B35; padding: 20px; margin: 25px 0; border-radius: 8px; }
          .footer { background: #f5f5f5; padding: 20px 30px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Îngrijire Invisalign</h1>
            <p>Tips pentru tratamentul cu alignere</p>
          </div>
          <div class="content">
            <p class="greeting">Draga {{name}},</p>
            <p>Tratamentul dumneavoastră Invisalign a început! Pentru rezultate optime:</p>
            <div class="info-box">
              <ul>
                <li>Purtați alignerele 20-22 ore pe zi</li>
                <li>Schimbați alignerele conform programului</li>
                <li>Îndepărtați alignerele când mâncați sau beți (exceptând apă)</li>
                <li>Curățați alignerele cu periuța și apă</li>
                <li>Vizitați clinica pentru controale lunare</li>
              </ul>
            </div>
            <p>Zâmbetul dumneavoastră perfect este aproape!</p>
          </div>
          <div class="footer">
            <p>Chelement Dental | Strada Gării nr.9, Baia Mare</p>
          </div>
        </div>
      </body>
      </html>
    `
  },
  {
    title: "Îngrijire după Albire Dentară",
    service: "Albire dentară",
    content: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden; }
          .header { background: linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%); padding: 40px 30px; text-align: center; color: white; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { padding: 40px 30px; }
          .greeting { font-size: 16px; color: #333; margin-bottom: 20px; }
          .info-box { background: #f8f9fa; border-left: 4px solid #FF6B35; padding: 20px; margin: 25px 0; border-radius: 8px; }
          .footer { background: #f5f5f5; padding: 20px 30px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Îngrijire după Albire Dentară</h1>
            <p>Mențineți zâmbetul strălucitor</p>
          </div>
          <div class="content">
            <p class="greeting">Draga {{name}},</p>
            <p>Dinții dumneavoastră sunt acum mai albi! Pentru a menține rezultatele:</p>
            <div class="info-box">
              <h3>Primele 48 de ore:</h3>
              <ul>
                <li>Evitați alimentele și băuturile colorate</li>
                <li>Folosiți paște de dinți pentru dinți albi</li>
              </ul>
              <h3>Îngrijire zilnică:</h3>
              <ul>
                <li>Periați și folosiți ața dentară regulat</li>
                <li>Vizitați dentistul pentru întreținere</li>
                <li>Evitați fumatul</li>
              </ul>
            </div>
            <p>Zâmbetul dumneavoastră strălucește!</p>
          </div>
          <div class="footer">
            <p>Chelement Dental | Strada Gării nr.9, Baia Mare</p>
          </div>
        </div>
      </body>
      </html>
    `
  },
  {
    title: "Îngrijire după Urgență Dentară",
    service: "Urgență dentară",
    content: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden; }
          .header { background: linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%); padding: 40px 30px; text-align: center; color: white; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { padding: 40px 30px; }
          .greeting { font-size: 16px; color: #333; margin-bottom: 20px; }
          .info-box { background: #f8f9fa; border-left: 4px solid #FF6B35; padding: 20px; margin: 25px 0; border-radius: 8px; }
          .footer { background: #f5f5f5; padding: 20px 30px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Îngrijire după Urgență Dentară</h1>
            <p>Recuperare și prevenire</p>
          </div>
          <div class="content">
            <p class="greeting">Draga {{name}},</p>
            <p>Urgența dentară a fost rezolvată! Pentru recuperare și prevenire:</p>
            <div class="info-box">
              <ul>
                <li>Urmați tratamentul prescris (antibiotice, analgezice)</li>
                <li>Aplicați comprese reci pentru a reduce umflarea</li>
                <li>Mâncați alimente moi și evitați partea afectată</li>
                <li>Mențineți igiena orală cu periuțe moi</li>
                <li>Programați controale regulate pentru a preveni recidive</li>
              </ul>
            </div>
            <p>Sănătatea dumneavoastră dentară este prioritatea noastră!</p>
          </div>
          <div class="footer">
            <p>Chelement Dental | Strada Gării nr.9, Baia Mare</p>
          </div>
        </div>
      </body>
      </html>
    `
  }
];

export async function POST() {
  try {
    const dummyOwnerId = 'dummy-owner-id'; // Replace with actual owner clerk_id

    for (const template of predefinedTemplates) {
      await sql`
        INSERT INTO educational_templates (title, content, service, is_default, created_by)
        VALUES (${template.title}, ${template.content}, ${template.service}, true, ${dummyOwnerId})
        ON CONFLICT DO NOTHING
      `;
    }

    return NextResponse.json({ success: true, message: 'Templates seeded successfully' });
  } catch (error) {
    console.error('Error seeding templates:', error);
    return NextResponse.json({ error: 'Failed to seed templates' }, { status: 500 });
  }
}