'use strict';
/* =====================================================================
   Algoritmo terapéutico de sofocos en menopausia — v2 (revisión oct-2026)
   Fuentes de las matrices:
   - AEEM. Criterios de elegibilidad de la Terapia Hormonal de la Menopausia (Ed. Universidad de Granada). Tabla resumen, valores literales.
   - FT: contraindicaciones de ficha técnica (estradiol, tibolona, EEC/bazedoxifeno, fezolinetant).
   - OMS. Medical eligibility criteria for contraceptive use, 6.ª ed. (2025). CC BY-NC-SA 3.0 IGO. Traducción no oficial.
   - EXT: extrapolado del estrógeno oral (TSEC sin categoría AEEM propia).
   Notación de celda: '2' categoría; '4FT' contraindicación de ficha técnica; '3EXT' extrapolada; 'NA' sin categoría/evidencia.
   ===================================================================== */

/* Umbral Cervantes-SF: >25 en el dominio Menopausia y Salud, escala 0–100.
   - Coronado PJ et al. Predictive and criterion validity of the Cervantes-SF menopause quality of life
     questionnaire. Menopause 2021;28(8):935–942. doi:10.1097/GME.0000000000001790
     (síndrome vasomotor moderado-grave: M+S AUC 0,883, S 81,9 %, E 77,9 %; vasomotor AUC 0,923, S 89,9 %, E 81,9 %).
   - Fasero M et al. Management of menopausal hot flushes. Recommendations from the Spanish Menopause Society.
     Eur J Obstet Gynecol Reprod Biol X 2025;25:100366. doi:10.1016/j.eurox.2025.100366
   Transformación lineal: puntuación directa / máximo posible × 100 (M+S: directa × 100/45). */
const CERVANTES_CUTOFF = {scale:'transformada', value:25};

const state = {age:null,amenorrhea:'',needsContraception:null,hasUterus:null,continueLate:false,route:null,cervantes:null,naturalFinal:false,eligibility:null,treatment:null};

const cervantesItems=[
{id:1,text:'De pronto noto que empiezo a sudar sin que haya hecho ningún esfuerzo',left:'Nunca',right:'Constantemente'},
{id:2,text:'Noto sofocaciones',left:'Nunca',right:'En todo momento'},
{id:3,text:'Durante el día noto que la cabeza me va doliendo cada vez más',left:'Nunca',right:'Todos los días'},
{id:4,text:'Aunque duermo, no consigo descansar',left:'Nunca me ocurre',right:'Constantemente'},
{id:5,text:'Noto que el corazón me late muy deprisa y sin control',left:'Nada',right:'Mucho'},
{id:6,text:'Noto hormigueos en manos y pies',left:'No, en absoluto',right:'Insoportable'},
{id:7,text:'Me da miedo hacer esfuerzos porque se me escapa la orina',left:'No, en absoluto',right:'Mucho'},
{id:8,text:'Mi salud me causa problemas con la actividad diaria (trabajos domésticos, ir al trabajo, etc.)',left:'En absoluto',right:'Constantemente'},
{id:9,text:'He notado que tengo más sequedad en la piel',left:'No, como siempre',right:'Sí, mucho más'},
{id:10,text:'No puedo más de lo nerviosa que estoy',left:'Nunca',right:'Constantemente'},
{id:11,text:'Todo me aburre, incluso las cosas que antes me divertían',left:'No es cierto',right:'Cierto'},
{id:12,text:'Desde que me levanto me encuentro cansada',left:'Nada',right:'Completamente'},
{id:13,text:'En mi vida el sexo es ...',left:'Nada importante',right:'Muy importante'},
{id:14,text:'Estoy satisfecha con la actividad sexual que tengo en este momento (incluso si no tengo)',left:'Nada',right:'Completamente'},
{id:15,text:'Me considero feliz en mi relación de pareja',left:'Nada',right:'Mucho',partner:true},
{id:16,text:'Mi papel como esposa o pareja es ...',left:'Nada importante',right:'Muy importante',partner:true}
];

const habits=['Ejercicio aeróbico regular y entrenamiento de fuerza 2–3 días/semana.','Dieta mediterránea, frutas y verduras; mantener peso saludable.','Higiene del sueño: horarios regulares, dormitorio fresco y evitar pantallas antes de dormir.','Evitar tabaco y moderar alcohol, cafeína, comidas grasas o picantes.','Reducir temperatura ambiente, vestir por capas, usar bebidas frías, ventilador o aire acondicionado si precisa.','Manejo del estrés y técnicas de relajación si hay ansiedad o insomnio asociado.'];

/* ---------- Matriz THM: AEEM, Criterios de elegibilidad de la Terapia Hormonal de la Menopausia ----------
   Ramírez I, de la Viuda E, Calaf J, Baquedano L, Coronado P, Llaneza P, Nieto V, Otero B, Sánchez S, Mendoza N.
   Consorcio de sociedades científicas para el uso de la THM. Editorial Universidad de Granada. ISBN(e) 978-84-338-6948-7.
   Valores literales de la «Tabla resumen. Criterios de elegibilidad de la THM» (pp. 62–66). Columnas usadas: THM combinada
   transdérmica, THM solo estrógenos transdérmica y oral, tibolona (la combinada oral y la THM local no se ofrecen en la herramienta).
   Notación de celda 'D|L': D = valor que aplica la herramienta para decidir; L = texto literal de la tabla AEEM.
   D: 1–4; 'NA' (no aplicable por falta de evidencia); 'IND' (sin cifra en la tabla: individualizar); 'SEV' (según gravedad);
   'I2C3' (inicio 2 / continuación 3). Cuando la celda depende de un supuesto (*), la herramienta lo ofrece como fila separada. */
const THM_COLS={combTD:'THM combinada transdérmica',combOral:'THM combinada oral',estrTD:'Estrógenos solos transdérmicos',estrOral:'Estrógenos solos orales',tib:'Tibolona',tsec:'TSEC (EEC + bazedoxifeno) — sin categoría AEEM propia'};
const THM_GROUPS=[
 {title:'Riesgo trombótico',rows:[
  {id:'tevPrev',label:'TVP/EP sin anticoagulación',cats:{combTD:'3',estrTD:'3',estrOral:'4',tib:'NA'}},
  {id:'tevAc',label:'TVP/EP con anticoagulación de acción directa',cats:{combTD:'IND|*',estrTD:'IND|*',estrOral:'NA|—',tib:'NA|—'},note:'AEEM: * Si fuese necesaria la THM, usar la vía transdérmica (Opinión de expertas/os).'},
  {id:'trombofilia',label:'Trombofilia asintomática',cats:{combTD:'2',estrTD:'2',estrOral:'3',tib:'NA'}}]},
 {title:'Trastornos neurológicos',rows:[
  {id:'migSA',label:'Migraña sin aura',cats:{combTD:'2',estrTD:'2',estrOral:'2',tib:'NA'}},
  {id:'migCA',label:'Migraña con aura',cats:{combTD:'I2C3|2 (I)/ 3* (C)',estrTD:'I2C3|2 (I)/ 3* (C)',estrOral:'3|3*',tib:'I2C3|2 (I)/ 3*(C)'},note:'AEEM: * Puede considerarse la administración de un antiagregante (opinión de expertas/os). I (inicio): la migraña aparece antes de la THM; C (continuación): la migraña aparece tras la THM.'},
  {id:'cefTens',label:'Cefalea tensional',cats:{combTD:'1',estrTD:'NA',estrOral:'NA',tib:'1'}}]},
 {title:'Enfermedad cardiovascular',rows:[
  {id:'ictus',label:'Ictus',cats:{combTD:'3|3/2*',estrTD:'3|3/2*',estrOral:'3',tib:'NA'}},
  {id:'ictusEsp',label:'Ictus — supuesto (*): no secundario a arteriosclerosis o hemorrágico, con estudio coronario/troncos supraaórticos normales',cats:{combTD:'2|3/2*',estrTD:'2|3/2*',estrOral:'3',tib:'NA'},note:'AEEM (*): paciente que por edad sea tributaria de THM y que su ictus no sea 2º a arterioesclerosis, o bien el ictus sea hemorrágico y su estudio coronario/troncos supraaórticos sean normales. Opinión de expertas/os.',flag:'ictusFR'},
  {id:'iam',label:'IAM',cats:{combTD:'3|3/2*',estrTD:'3|3/2*, **',estrOral:'3|3/2*',tib:'NA'}},
  {id:'iamEsp',label:'IAM — supuesto (*): sin causa isquémica del IAM ni otros FR',cats:{combTD:'2|3/2*',estrTD:'2|3/2*, **',estrOral:'2|3/2*',tib:'NA'},note:'AEEM: * Sin causa isquémica del IAM ni otros FR (Opinión de expertas/os). ** IAM corregido mediante bypass con injerto de vena safena: se podría valorar mantener la THM con estrógenos solos.'},
  {id:'angina',label:'Angina',cats:{combTD:'2|2/3*',estrTD:'2|2/3*',estrOral:'2|2/3*',tib:'NA'}},
  {id:'anginaEsp',label:'Angina — supuesto (*): causa isquémica o con otros FR',cats:{combTD:'3|2/3*',estrTD:'3|2/3*',estrOral:'3|2/3*',tib:'NA'},note:'AEEM: * causa isquémica o con otros FR (Opinión de expertas/os).'},
  {id:'hta',label:'Hipertensión',cats:{combTD:'2',estrTD:'2',estrOral:'2|2/1****',tib:'2'},note:'AEEM: *** combinación de estradiol + drospirenona (THM combinada oral: 1); **** combinación de estradiol + noretisterona.'}]},
 {title:'Tabaco',rows:[
  {id:'tabaco',label:'Tabaco',cats:{combTD:'2',estrTD:'2',estrOral:'3',tib:'NA'}}]},
 {title:'Alteraciones metabólicas relacionadas con el síndrome metabólico',rows:[
  {id:'dm',label:'Diabetes mellitus',cats:{combTD:'1|1*',estrTD:'1|1*',estrOral:'1|1*',tib:'NA'},note:'AEEM: * evidencia limitada.'},
  {id:'hipercol',label:'Hipercolesterolemia',cats:{combTD:'1',estrTD:'1',estrOral:'1',tib:'NA'}},
  {id:'hipercolDM',label:'Hipercolesterolemia y diabetes',cats:{combTD:'1|1*',estrTD:'1|1*',estrOral:'1|1*',tib:'NA'},note:'AEEM: * evidencia limitada.'},
  {id:'imc25',label:'IMC entre 25-30 kg/m2',group:'imc',cats:{combTD:'1',estrTD:'1',estrOral:'2',tib:'NA'}},
  {id:'imc30',label:'IMC >30 kg/m2',group:'imc',cats:{combTD:'2',estrTD:'2',estrOral:'3',tib:'NA'},note:'AEEM: * No hay datos en mujeres con IMC>35.'}]},
 {title:'Enfermedades digestivas',rows:[
  {id:'eii',label:'Enfermedad inflamatoria intestinal',cats:{combTD:'1',estrTD:'1',estrOral:'2',tib:'NA'},note:'AEEM: * Valorar factores de riesgo trombótico adicionales.'},
  {id:'hepC',label:'Antecedentes de hepatitis C',cats:{combTD:'2',estrTD:'2',estrOral:'2',tib:'NA'}},
  {id:'hepAguda',label:'Hepatitis aguda',cats:{combTD:'SEV|4/3**',estrTD:'SEV|4/2**',estrOral:'SEV|4/2**',tib:'NA'},note:'AEEM: ** en función de la gravedad de la condición.',ft:'hepAguda',hep:true},
  {id:'cirrosis',label:'Cirrosis',cats:{combTD:'4|NA*',estrTD:'4|NA*',estrOral:'4|NA*',tib:'4|NA*'},note:'AEEM: * no por el preparado sino por el daño hepático se aplicaría categoría 4 (Opinión de expertas/os).',hep:true}]},
 {title:'Cáncer de mama',rows:[
  {id:'mamaRHneg',label:'Supervivientes cánceres de mama RH(-)',cats:{combTD:'2',estrTD:'2',estrOral:'2',tib:'3'},ft:'mama',nh:'tamox'},
  {id:'mamaRHpos',label:'Supervivientes cánceres de mama RH(+)',cats:{combTD:'3|3*',estrTD:'3|3*',estrOral:'3|3*',tib:'4'},note:'AEEM: * Opinión de expertas/os.',ft:'mama',nh:'tamox'},
  {id:'brca1',label:'Portadora BRCA1',cats:{combTD:'2',estrTD:'2',estrOral:'2',tib:'NA'}},
  {id:'brca2',label:'Portadora BRCA2',cats:{combTD:'2|2*',estrTD:'2|2*',estrOral:'2|2*',tib:'NA'},note:'AEEM: * Extrapolación del BRCA1 (opinión de expertas/os).'}]},
 {title:'Otros cánceres',rows:[
  {id:'ovario',label:'Cáncer de ovario',cats:{combTD:'1|1*',estrTD:'1|1*',estrOral:'1|1*',tib:'1|1*'},note:'AEEM: * Se requiere precaución para tumores de células serosas o de la granulosa (Opinión de expertas/os).'},
  {id:'endometrio',label:'Cáncer de endometrio',cats:{combTD:'2|2*',estrTD:'2|2*',estrOral:'2|2*',tib:'2|2*'},note:'AEEM: * No diferencias en SLE (menor recurrencia con THM combinada que con THM solo estrógenos).',ft:'tumorED'},
  {id:'cervix',label:'Cáncer de cérvix',cats:{combTD:'2|2*',estrTD:'2|2*',estrOral:'2|2*',tib:'2|2*'},note:'AEEM: * No diferencias en supervivencia ni SLE. Escasa evidencia.'},
  {id:'colon',label:'Cáncer de colon',cats:{combTD:'1|1*',estrTD:'1|1**',estrOral:'1|1**',tib:'NA'},note:'AEEM: * No se evalúan diferencias entre formas de THM. ** Parece evidenciarse mejor resultado con solo estrógenos.'},
  {id:'pulmon',label:'Cáncer de pulmón',cats:{combTD:'2|2*',estrTD:'NA',estrOral:'NA',tib:'NA'},note:'AEEM: * No se evalúan diferencias entre formas de THM. El tabaco incrementa el riesgo.'},
  {id:'melanoma',label:'Melanoma',cats:{combTD:'2|2*',estrTD:'2|2*',estrOral:'2|2*',tib:'NA'},note:'AEEM: * Sólo un estudio de cohortes con amplio seguimiento de 10 años.'}]},
 {title:'Interacciones farmacológicas (medicación concomitante)',rows:[
  {id:'antiHTA',label:'Antihipertensivos',cats:{combTD:'1',estrTD:'1',estrOral:'2|2***',tib:'2|2***'},note:'AEEM: *** En algunas pacientes la THM oral puede alterar el control de la TA y requerirse ajuste de dosis.'},
  {id:'estatinas',label:'Estatinas',cats:{combTD:'1|1***',estrTD:'1|1***',estrOral:'2|1/2**',tib:'2|1/2**'},note:'AEEM: ** la THM oral tiende a modificar el perfil lipídico; considerar según el perfil de la paciente.'},
  {id:'ansioliticos',label:'Ansiolíticos/hipnóticos',cats:{combTD:'1',estrTD:'1',estrOral:'1',tib:'2|1/2*'},note:'AEEM: * Con midazolam.'},
  {id:'analgesicos',label:'Analgésicos/antiinflamatorios',cats:{combTD:'1',estrTD:'1',estrOral:'1',tib:'1'}},
  {id:'antidepresivos',label:'Antidepresivos',cats:{combTD:'1',estrTD:'1',estrOral:'1',tib:'1'}},
  {id:'ia',label:'Inhibidores de la aromatasa',cats:{combTD:'4',estrTD:'4',estrOral:'4',tib:'4'}},
  {id:'ado',label:'Antidiabéticos orales',cats:{combTD:'1',estrTD:'1',estrOral:'1',tib:'1'}},
  {id:'insulina',label:'Insulina',cats:{combTD:'1',estrTD:'1',estrOral:'1',tib:'1'}},
  {id:'tiroideas',label:'Hormonas tiroideas',cats:{combTD:'1',estrTD:'1',estrOral:'1',tib:'1'},note:'AEEM: * Valorar ajustar dosis (poca relevancia clínica).'},
  {id:'broncodil',label:'Broncodilatadores',cats:{combTD:'1',estrTD:'1',estrOral:'1|1*',tib:'1|1*'},note:'AEEM: * Con teofilina oral ajustar dosis.'},
  {id:'anticoag',label:'Anticoagulantes',cats:{combTD:'1',estrTD:'1',estrOral:'2|1/2*',tib:'2|2*'},note:'AEEM: * Se puede requerir ajustar la dosis del anticoagulante warfarínico o suspensión de la THM o cambio de vía.'},
  {id:'serms',label:'SERMS',cats:{combTD:'4',estrTD:'4',estrOral:'4',tib:'4'}},
  {id:'corticoides',label:'Corticoides',cats:{combTD:'2',estrTD:'2',estrOral:'2',tib:'2'}},
  {id:'antiepilep',label:'Antiepilépticos',cats:{combTD:'3',estrTD:'3',estrOral:'4',tib:'4'},note:'AEEM: * La mayoría son potentes inductores enzimáticos y pueden reducir la efectividad estrogénica.'},
  {id:'rifampicina',label:'Antibióticos inhibidores enzimáticos (rifampicina/rifabutina)',cats:{combTD:'2',estrTD:'2',estrOral:'2',tib:'2'}},
  {id:'antineoplas',label:'Antineoplásicos',cats:{combTD:'4',estrTD:'4',estrOral:'4',tib:'4'}},
  {id:'inmunosup',label:'Inmunosupresores',cats:{combTD:'3',estrTD:'3',estrOral:'3',tib:'3'}},
  {id:'antifung',label:'Antifúngicos orales',cats:{combTD:'1',estrTD:'1',estrOral:'2|1/2*',tib:'2|1/2*'},note:'AEEM: * En tratamientos crónicos.'},
  {id:'antirretro',label:'Antirretrovirales',cats:{combTD:'2|1/2*',estrTD:'2|1/2*',estrOral:'2|1/2*',tib:'2|1/2*'}},
  {id:'dopamin',label:'Dopaminérgicos',cats:{combTD:'2',estrTD:'2',estrOral:'2',tib:'2'}},
  {id:'litoliticos',label:'Litolíticos',cats:{combTD:'2',estrTD:'2',estrOral:'3',tib:'3'}},
  {id:'neuroestim',label:'Neuroestimulantes',cats:{combTD:'2',estrTD:'2',estrOral:'2',tib:'2'}},
  {id:'antitiroid',label:'Antitiroideos',cats:{combTD:'2',estrTD:'2',estrOral:'2',tib:'2'}},
  {id:'antipsic',label:'Antipsicóticos',cats:{combTD:'2|2/3*',estrTD:'1',estrOral:'1',tib:'1'}},
  {id:'antipsicAP',label:'Antipsicóticos — aripiprazol o pimozida (*)',cats:{combTD:'3|2/3*',estrTD:'1',estrOral:'1',tib:'1'},note:'AEEM: * Algunos estudios han comunicado interacción con el gestágeno para aripiprazol y pimozida.'}]}
];
const THM_CONDITIONS=THM_GROUPS.flatMap(g=>g.rows);
/* Columna «THM combinada oral» de la tabla resumen AEEM (valores literales). */
const COMB_ORAL={tevPrev:'4',tevAc:'NA|—',trombofilia:'4',migSA:'2',migCA:'3|3*',cefTens:'1',ictus:'3',ictusEsp:'3',iam:'3|3/2*',iamEsp:'2|3/2*',angina:'2|2/3*',anginaEsp:'3|2/3*',hta:'2|2/1***',tabaco:'3',dm:'1',hipercol:'1',hipercolDM:'1|1*',imc25:'2',imc30:'3',eii:'2',hepC:'2',hepAguda:'SEV|4/3**',cirrosis:'4|NA*',mamaRHneg:'2',mamaRHpos:'3|3*',brca1:'2',brca2:'2|2*',ovario:'1|1*',endometrio:'2|2*',cervix:'2|2*',colon:'1|1*',pulmon:'2|2*',melanoma:'2|2*',antiHTA:'2|1**/2***',estatinas:'2|1/2**',ansioliticos:'1',analgesicos:'1',antidepresivos:'1',ia:'4',ado:'1',insulina:'1',tiroideas:'1',broncodil:'1|1*',anticoag:'2|1/2*',serms:'4',corticoides:'2',antiepilep:'4',rifampicina:'2',antineoplas:'4',inmunosup:'3',antifung:'2|1/2*',antirretro:'2|1/2*',dopamin:'2',litoliticos:'3',neuroestim:'2',antitiroid:'2',antipsic:'2|2/3*',antipsicAP:'3|2/3*'};
THM_CONDITIONS.forEach(r=>{if(COMB_ORAL[r.id]!=null)r.cats.combOral=COMB_ORAL[r.id]});
/* Complemento de la herramienta (ficha técnica): no altera la categoría AEEM; marca la opción como «contraindicada en ficha técnica». */
const THM_FT_CONTRA=[
 {id:'ftMama',key:'mama',label:'Cáncer de mama actual, antecedente o sospecha'},
 {id:'ftTumorED',key:'tumorED',label:'Tumor estrógeno-dependiente (p. ej., endometrio) activo o sospecha'},
 {id:'ftSangrado',key:'sangrado',label:'Sangrado genital no filiado'},
 {id:'ftHiperplasia',key:'hiperplasia',label:'Hiperplasia endometrial no tratada'},
 {id:'ftHepAguda',key:'hepAguda',label:'Hepatopatía aguda o antecedente con pruebas hepáticas no normalizadas',hep:true},
 {id:'ftPorfiria',key:'porfiria',label:'Porfiria'}
];
const THM_PRECAUTIONS=[
 {id:'htaNC',label:'HTA no controlada',demoteOral:true,note:'Controlar antes de iniciar; preferir vía transdérmica.'},
 {id:'tg',label:'Hipertrigliceridemia',demoteOral:true,note:'El estrógeno oral eleva triglicéridos (riesgo de pancreatitis): preferir vía transdérmica.'},
 {id:'litiasis',label:'Litiasis biliar',demoteOral:true,note:'Preferir vía transdérmica.'},
 {id:'endometriosis',label:'Endometriosis (incluida histerectomizada)',demoteOral:false,note:'Valorar asociar gestágeno aun sin útero.'}
];

/* ---------- Matriz anticoncepción: OMS, Medical eligibility criteria for contraceptive use, 6.ª ed. (2025) ----------
   Valores literales de la tabla resumen y de las tablas por método (sección 5). 'I2C3' = inicio 2 / continuación 3;
   '3/4' = categoría 3 o 4 según gravedad (OMS). La decisión usa la categoría de INICIO. Columnas: COC, POP, LNG-IUD, Cu-IUD. */
const ACO_COLS={ahc:'AHC (E2/estetrol)',lng:'DIU-LNG',pop:'Gestágeno solo oral (POP)',cu:'DIU de cobre'};
const ACO_CONDITIONS=[
 {id:'tevPrev',label:'TVP/TEP: antecedente',cats:{ahc:'4',lng:'2',pop:'2',cu:'1'}},
 {id:'tevAgudo',label:'TVP/TEP aguda',cats:{ahc:'4',lng:'3',pop:'3',cu:'1'}},
 {id:'tevAc',label:'TVP/TEP con tratamiento anticoagulante establecido',cats:{ahc:'4',lng:'2',pop:'2',cu:'1'}},
 {id:'cirugia',label:'Cirugía mayor con inmovilización prolongada',cats:{ahc:'4',lng:'2',pop:'2',cu:'1'}},
 {id:'trombofilia',label:'Mutaciones trombogénicas conocidas (factor V Leiden, protrombina, déficit de proteína S, C o antitrombina)',cats:{ahc:'4',lng:'2',pop:'2',cu:'1'}},
 {id:'cardio',label:'Cardiopatía isquémica actual o antecedente',cats:{ahc:'4',lng:'I2C3',pop:'I2C3',cu:'1'}},
 {id:'ictus',label:'Ictus (antecedente de accidente cerebrovascular)',cats:{ahc:'4',lng:'2',pop:'I2C3',cu:'1'}},
 {id:'valvular',label:'Valvulopatía complicada (hipertensión pulmonar, riesgo de FA, antecedente de endocarditis)',cats:{ahc:'4',lng:'2',pop:'1',cu:'2'},note:'OMS: ver aclaraciones de la sección 5 para DIU.'},
 {id:'lesAPL',label:'LES con anticuerpos antifosfolípido positivos (o desconocidos)',cats:{ahc:'4',lng:'3',pop:'3',cu:'1'}},
 {id:'migSA35',label:'Migraña sin aura, edad <35 años',cats:{ahc:'I2C3',lng:'2',pop:'I1C2',cu:'1'}},
 {id:'migSA',label:'Migraña sin aura, edad ≥35 años',cats:{ahc:'I3C4',lng:'2',pop:'I1C2',cu:'1'}},
 {id:'migCA',label:'Migraña con aura (cualquier edad)',cats:{ahc:'4',lng:'I2C3',pop:'I2C3',cu:'1'}},
 {id:'htaCtrl',label:'HTA adecuadamente controlada (PA evaluable)',cats:{ahc:'3',lng:'1',pop:'1',cu:'1'},note:'OMS: ver aclaraciones de la sección 5.'},
 {id:'hta140',label:'PA sistólica 140–159 o diastólica 90–99 mm Hg',cats:{ahc:'3',lng:'1',pop:'1',cu:'1'}},
 {id:'hta160',label:'PA sistólica ≥160 o diastólica ≥100 mm Hg',cats:{ahc:'4',lng:'2',pop:'2',cu:'1'}},
 {id:'vascular',label:'Enfermedad vascular',cats:{ahc:'4',lng:'2',pop:'2',cu:'1'}},
 {id:'multiRCV',label:'Múltiples factores de riesgo cardiovascular arterial (edad, tabaco, diabetes, HTA, dislipemia)',cats:{ahc:'3/4',lng:'2',pop:'2',cu:'1'},note:'OMS 3/4 según gravedad; ver aclaraciones de la sección 5.'},
 {id:'dm',label:'Diabetes sin enfermedad vascular',cats:{ahc:'2',lng:'2',pop:'2',cu:'1'}},
 {id:'dmNefro',label:'Diabetes con nefropatía, retinopatía o neuropatía',cats:{ahc:'3/4',lng:'2',pop:'2',cu:'1'},note:'OMS 3/4 según gravedad.'},
 {id:'dmVasc',label:'Diabetes con otra enfermedad vascular o >20 años de evolución',cats:{ahc:'3/4',lng:'2',pop:'2',cu:'1'},note:'OMS 3/4 según gravedad.'},
 {id:'smokeLess',label:'Fumadora ≥35 años, <15 cigarrillos/día',cats:{ahc:'3',lng:'1',pop:'1',cu:'1'}},
 {id:'smoke15',label:'Fumadora ≥35 años, ≥15 cigarrillos/día',cats:{ahc:'4',lng:'1',pop:'1',cu:'1'}},
 {id:'obesity',label:'Obesidad (IMC ≥30 kg/m²)',cats:{ahc:'2',lng:'1',pop:'1',cu:'1'}},
 {id:'mamaAct',label:'Cáncer de mama actual',cats:{ahc:'4',lng:'4',pop:'4',cu:'1'},nh:'tamox'},
 {id:'mamaPrev',label:'Cáncer de mama previo, sin enfermedad durante 5 años',cats:{ahc:'3',lng:'3',pop:'3',cu:'1'},nh:'tamox'},
 {id:'cirrosis',label:'Cirrosis grave (descompensada)',cats:{ahc:'4',lng:'3',pop:'3',cu:'1'},hep:true},
 {id:'adenoma',label:'Adenoma hepatocelular',cats:{ahc:'4',lng:'3',pop:'3',cu:'1'},hep:true},
 {id:'hepatoma',label:'Tumor hepático maligno (hepatoma)',cats:{ahc:'4',lng:'3',pop:'3',cu:'1'},hep:true},
 {id:'sangrado',label:'Sangrado vaginal no explicado (sospecha de patología grave), antes de evaluación',cats:{ahc:'2',lng:'I4C2',pop:'2',cu:'I4C2'}}
];

/* ---------- Seguridad de los tratamientos no hormonales (FT) ---------- */
const NH_CHECKS=[
 {id:'nhHep',label:'Hepatopatía o ALT/AST/bilirrubina ≥2×LSN',note:'Fezolinetant: no iniciar (FT/EMA 2024). Evitar cimicífuga.'},
 {id:'nhCyp',label:'Inhibidores moderados/potentes de CYP1A2 (fluvoxamina, ciprofloxacino, enoxacino, mexiletina…)',note:'Fezolinetant contraindicado (FT).'},
 {id:'nhRenal',label:'ERC grave (FG <30 ml/min)',note:'Fezolinetant no recomendado; ajustar gabapentina.'},
 {id:'nhTamox',label:'En tratamiento con tamoxifeno',note:'Evitar paroxetina y fluoxetina (CYP2D6); preferir venlafaxina, citalopram/escitalopram o gabapentina.'}
];

const treatmentLibrary={
natural:{title:'Hábitos saludables + productos naturales',brand:'Ejemplo: cimicífuga racemosa extracto isopropanólico 40 mg/día (evitar si hepatopatía)',patient:'Sus sofocos tienen un impacto leve o se ha decidido iniciar una opción no hormonal. Recomendamos ejercicio regular, dieta mediterránea, higiene del sueño, evitar tabaco y moderar alcohol/cafeína. Puede valorarse un producto natural, revisando la respuesta en 8–12 semanas. Suspéndalo y consulte si nota orina oscura, color amarillento de piel u ojos o cansancio intenso.'},
contraceptionE2:{title:'Anticoncepción hormonal combinada con E2/estetrol',col:'ahc',brand:'Ejemplos: Qlaira®, Drovelis® o Zoely® según perfil y ficha técnica',patient:'Este tratamiento actúa como anticonceptivo y puede ayudar a mejorar los sofocos. Debe tomarse siguiendo la pauta indicada. Consulte de forma urgente si presenta dolor torácico, dificultad respiratoria, dolor intenso en una pierna, cefalea brusca intensa, alteraciones visuales o síntomas neurológicos.'},
contraceptionLNG:{title:'DIU de levonorgestrel 52 mg',col:'lng',brand:'Ejemplo: Mirena® (52 mg; aporta protección endometrial si después se añade estradiol)',patient:'Se recomienda un método anticonceptivo sin estrógenos, de larga duración. No trata los sofocos por sí mismo: si persisten, se valorará añadir un tratamiento específico.'},
contraceptionPOP:{title:'Anticonceptivo oral de gestágeno solo',col:'pop',brand:'Ejemplos: desogestrel 75 µg; drospirenona 4 mg (Slinda®)',patient:'Se recomienda una píldora anticonceptiva sin estrógenos. Puede producir sangrados irregulares. No trata los sofocos por sí misma: si persisten, se valorará un tratamiento específico.'},
contraceptionCu:{title:'DIU de cobre (anticoncepción no hormonal)',col:'cu',brand:'Ejemplo: DIU de cobre de 5 o 10 años',patient:'Se recomienda un método anticonceptivo sin hormonas. Los sofocos se tratarán con medidas no hormonales.'},
estrogenOnlyTD:{title:'Estrógenos solos por vía transdérmica',col:'estrTD',brand:'Ejemplos: Lenzetto®, Estradot®, Evopad®, Oestraclin®',patient:'Se pauta estradiol para mejorar sofocos, sueño y calidad de vida. Al no tener útero no precisa progesterona. Use el tratamiento según la pauta indicada. Consulte si aparece sangrado vaginal, dolor torácico, dificultad respiratoria, cefalea intensa de nueva aparición o síntomas neurológicos.'},
estrogenOnlyOral:{title:'Estrógenos solos por vía oral',col:'estrOral',brand:'Ejemplos: Progynova® 1 mg, Meriestra® 2 mg',patient:'Se pauta estrógeno oral para mejorar los sofocos. Consulte ante dolor torácico, dificultad respiratoria, cefalea intensa, síntomas neurológicos o sangrado vaginal.'},
combinedCyclic:{title:'THM combinada secuencial/cíclica',col:'combTD',brand:'Ejemplo transdérmico: Lenzetto®/Estradot®/Evopad®/Oestraclin® + progesterona micronizada 200 mg 12–14 días/mes',patient:'El tratamiento combina estradiol y progesterona para proteger el endometrio. Con esta pauta es esperable un sangrado programado. Consulte si el sangrado es muy abundante, prolongado, irregular o diferente al esperado, o si presenta dolor torácico, dificultad respiratoria o cefalea intensa.'},
combinedContinuous:{title:'THM combinada continua',col:'combTD',brand:'Ejemplo transdérmico: Lenzetto®/Estradot®/Evopad®/Oestraclin® + progesterona micronizada 100 mg diaria',patient:'El objetivo es mejorar los sofocos evitando sangrado por deprivación. Durante los primeros meses puede aparecer manchado irregular; consulte si persiste, aumenta o aparece tras un periodo sin sangrado, o ante dolor torácico, dificultad respiratoria o cefalea intensa.'},
combinedCyclicOral:{title:'THM combinada oral secuencial/cíclica',col:'combOral',brand:'Ejemplos: estradiol oral 1–2 mg + progesterona micronizada 200 mg 12–14 días/mes; estradiol + didrogesterona secuencial (Femoston® 1/10, 2/10)',patient:'El tratamiento combina estrógeno y gestágeno por vía oral para proteger el endometrio. Con esta pauta es esperable un sangrado programado. Consulte si el sangrado es muy abundante, prolongado o diferente al esperado, o si presenta dolor torácico, dificultad respiratoria, dolor intenso en una pierna o cefalea intensa.'},
combinedContinuousOral:{title:'THM combinada oral continua',col:'combOral',brand:'Ejemplos: estradiol + drospirenona (Angeliq®), estradiol + noretisterona (Activelle®), estradiol + didrogesterona continua (Femoston® conti)',patient:'El objetivo es mejorar los sofocos evitando sangrado por deprivación. Durante los primeros meses puede aparecer manchado irregular; consulte si persiste, aumenta o aparece tras un periodo sin sangrado, o ante dolor torácico, dificultad respiratoria, dolor intenso en una pierna o cefalea intensa.'},
tibolone:{title:'Tibolona',col:'tib',brand:'Ejemplos: Boltín®, Tibocina® o tibolona EFG',patient:'La tibolona puede mejorar sofocos y, en algunas mujeres, sueño, ánimo y sexualidad. No suele producir sangrado. Consulte si aparece sangrado vaginal, dolor torácico, dificultad respiratoria, dolor intenso en una pierna o cefalea intensa.'},
tsec:{title:'TSEC: estrógenos conjugados + bazedoxifeno',col:'tsec',brand:'Ejemplo: Duavive®',patient:'Este tratamiento combina estrógenos con bazedoxifeno y puede ser útil cuando se desea evitar gestágenos. Consulte si aparece sangrado vaginal, dolor torácico, dificultad respiratoria, dolor intenso en una pierna o cefalea intensa.'},
neurokinin:{title:'Antagonista del receptor NK3 (fezolinetant)',brand:'Ejemplo: fezolinetant 45 mg/día (Veoza®), según disponibilidad y ficha técnica',patient:'Es una alternativa no hormonal para reducir sofocos. Antes de empezar y durante los primeros meses se le pedirá una analítica hepática. Suspéndalo y consulte si nota cansancio intenso, náuseas, picor, orina oscura o color amarillento de piel u ojos.'},
nonHormonal:{title:'Tratamiento no hormonal sintomático',brand:'Ejemplos: venlafaxina, desvenlafaxina, escitalopram, paroxetina 7,5 mg o gabapentina según perfil clínico',patient:'Existen alternativas no hormonales que pueden reducir los sofocos. Elegiremos la más adecuada según antecedentes, medicación habitual y preferencias.'}
};

function $(id){return document.getElementById(id)} function qsa(sel){return Array.from(document.querySelectorAll(sel))} function round(n){return Math.round(n*10)/10}
function parseCat(v){if(v==null)return{n:null,src:''};let d=String(v),lit=null;if(d.includes('|')){[d,lit]=d.split('|')}
 if(/^(IND|SEV)EXT$/.test(d)){const q=parseCat(d.slice(0,-3)+(lit?'|'+lit:''));q.src='EXT';return q}
 if(d==='NA')return{n:null,src:'NA',lit:lit||'NA'};if(d==='IND')return{n:2.5,src:'',lit:lit||'—'};if(d==='SEV')return{n:3.5,src:'',lit:lit||'según gravedad'};if(d==='3/4')return{n:3.5,src:'',lit:'3/4'};
 let m=d.match(/^I(\d)C(\d)$/);if(m)return{n:Number(m[1]),src:'',lit:lit||`I ${m[1]} / C ${m[2]}`};m=d.match(/^(\d)(.*)$/);return{n:Number(m[1]),src:m[2]||'',lit}}
function catLabel(v){const p=parseCat(v);if(p.lit)return p.lit+(p.src==='EXT'?' (ext.)':'');if(p.src==='NA')return 'NA';return p.n+(p.src==='EXT'?' (ext.)':'')}
function maxLabel(n,route){if(n===3.5)return route==='contraception'?'3/4':'según gravedad';if(n===2.5)return 'individualizar';return String(n)}
function init(){renderCervantes();bindEvents();updateSummary()}
function bindEvents(){
 if($('btn-start')) $('btn-start').addEventListener('click',()=>goTo('station-context'));
 $('age').addEventListener('input',renderContextDynamic);$('amenorrhea').addEventListener('change',renderContextDynamic);$('btn-context').addEventListener('click',validateContext);
 $('hasPartner').addEventListener('change',()=>{renderCervantes();computeCervantes()});
 $('btn-cervantes-continue').addEventListener('click',()=>{state.naturalFinal=false;state.treatment=null;prepareRoute();unlockStation('station-route');goTo('station-route')});
 $('btn-finish-natural').addEventListener('click',()=>{state.naturalFinal=true;state.route='natural';state.treatment='natural';renderTreatmentOptions();generateReports();unlockStation('station-report');goTo('station-report');updateSummary()});
 $('btn-route').addEventListener('click',()=>{renderEligibility();unlockStation('station-eligibility');goTo('station-eligibility')});
 $('btn-eligibility').addEventListener('click',validateEligibility);
 $('btn-treatment').addEventListener('click',()=>{if(!state.treatment){flash($('treatment-conclusion'),'Seleccione una opción terapéutica para generar el informe.');return}generateReports();unlockStation('station-report');goTo('station-report')});
 $('btn-reset').addEventListener('click',()=>location.reload());
 qsa('.copy-btn').forEach(btn=>btn.addEventListener('click',()=>copyText(btn.dataset.copy,btn)));
 qsa('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{if(!btn.classList.contains('locked'))goTo(btn.dataset.target)}))
}

/* ---------- Situación ---------- */
function isLateSafety(age,amen){return Number(age)>=60||amen==='gt10'}
function lateSafetyText(){return 'Mujer ≥60 años y/o con más de 10 años desde la menopausia: el inicio de THM sistémica requiere valoración individualizada del balance beneficio-riesgo. Priorizar alternativas no hormonales cuando sea posible; si se indica THM, preferir vía transdérmica, dosis mínima eficaz y revisión estrecha.'}
function lateCategory3Text(){return 'AEEM, tabla resumen (edad y duración): 60-69 años, 2/3*** — continuación de la THM categoría 2; inicio de la THM por encima de los 10 años de la menopausia categoría 3. > 70 años: categoría 3. Tibolona: 2 (salvo > 70 años con >5 años de uso: 3).'}
function amenorrheaLabel(v){return({lt12:'<12 meses',y1to5:'1–5 años',y5to10:'5–10 años',gt10:'>10 años'})[v]||'pendiente'}
function renderContextDynamic(){const age=Number($('age').value||0), amen=$('amenorrhea').value, zone=$('context-dynamic');zone.innerHTML='';$('context-conclusion').className='conclusion empty';$('context-conclusion').textContent='Complete edad y tiempo de amenorrea para definir la ruta inicial.';if(age&&age<40){zone.innerHTML='<div class="danger-box"><strong>Fuera de esta herramienta.</strong><br>Paciente menor de 40 años: valorar IOP/menopausia precoz en módulo específico.</div>';return} if(!amen)return;const warn=isLateSafety(age,amen)?`<div class="warning-box"><strong>Advertencia de seguridad.</strong><br>${lateSafetyText()}</div>`:'';if(amen==='lt12'){zone.innerHTML=warn+'<div class="card"><label class="field-label">Amenorrea &lt;12 meses: ¿precisa anticoncepción?</label><p class="hint">Referencia habitual: hasta 12 meses de amenorrea si ≥50 años y 24 meses si &lt;50 años.</p><div class="radio-stack"><label><input type="radio" name="needContraception" value="yes"> Sí, precisa anticoncepción</label><label><input type="radio" name="needContraception" value="no"> No precisa anticoncepción</label></div></div><div id="uterus-zone"></div>';qsa('input[name="needContraception"]').forEach(r=>r.addEventListener('change',e=>{state.needsContraception=e.target.value==='yes';if(state.needsContraception){$('uterus-zone').innerHTML=''}else renderUterusQuestion($('uterus-zone'))}))}else{zone.innerHTML=warn+'<div id="uterus-zone"></div>';renderUterusQuestion($('uterus-zone'))}}
function renderUterusQuestion(container){container.innerHTML='<div class="card"><label class="field-label">¿Tiene útero?</label><div class="radio-stack"><label><input type="radio" name="hasUterus" value="yes"> Sí, precisa protección endometrial</label><label><input type="radio" name="hasUterus" value="no"> No, histerectomizada</label></div></div>';qsa('input[name="hasUterus"]').forEach(r=>r.addEventListener('change',e=>state.hasUterus=e.target.value==='yes'))}
function validateContext(){const age=Number($('age').value||0), amen=$('amenorrhea').value;if(!age||!amen){flash($('context-conclusion'),'Debe indicar edad y tiempo en amenorrea.');return} if(age<40){$('context-conclusion').className='conclusion red';$('context-conclusion').innerHTML='<h3>Fuera de calculadora</h3>Paciente menor de 40 años. Valorar IOP/menopausia precoz.';updateSummary();return}state.age=age;state.amenorrhea=amen;state.continueLate=isLateSafety(age,amen);state.hasUterus=null;state.needsContraception=null;if(amen==='lt12'){const sel=document.querySelector('input[name="needContraception"]:checked');if(!sel){flash($('context-conclusion'),'En amenorrea <12 meses debe indicar si precisa anticoncepción.');return}state.needsContraception=sel.value==='yes';if(!state.needsContraception){const uterus=document.querySelector('input[name="hasUterus"]:checked');if(!uterus){flash($('context-conclusion'),'Si no precisa anticoncepción, indique si tiene útero.');return}state.hasUterus=uterus.value==='yes'}}else{const uterus=document.querySelector('input[name="hasUterus"]:checked');if(!uterus){flash($('context-conclusion'),'Debe indicar si tiene útero para seleccionar la THM.');return}state.hasUterus=uterus.value==='yes'}$('context-conclusion').className=state.continueLate?'conclusion amber':'conclusion';$('context-conclusion').innerHTML='<h3>Situación validada</h3>'+contextText()+(state.continueLate?'<p><strong>Advertencia:</strong> '+lateSafetyText()+'</p>':'')+' Se habilita la Escala Cervantes SFv2.';unlockStation('station-cervantes');updateSummary();goTo('station-cervantes')}
function contextText(){const label=amenorrheaLabel(state.amenorrhea);if(state.amenorrhea==='lt12'){return state.needsContraception?`Paciente de ${state.age} años, amenorrea ${label}, con necesidad anticonceptiva: ruta anticonceptiva.`:`Paciente de ${state.age} años, amenorrea ${label}, sin necesidad anticonceptiva, ${state.hasUterus?'con útero':'sin útero'}: ruta THM según elegibilidad.`}return `Paciente de ${state.age} años, amenorrea ${label}, ${state.hasUterus?'con útero':'sin útero'}.`}

/* ---------- Cervantes ---------- */
function renderCervantes(){const hasPartner=$('hasPartner')?.checked??true;const domains={1:'🔥 Dominio vasomotor',3:'🩺 Salud y descanso',6:'🌿 Salud general',10:'🧠 Estado psíquico',13:'💋 Sexualidad',15:'🤝 Pareja'};let html='<div class="scale-row head"><div class="scale-cell">Ítem</div><div class="scale-cell">0</div><div class="scale-cell">1</div><div class="scale-cell">2</div><div class="scale-cell">3</div><div class="scale-cell">4</div><div class="scale-cell">5</div></div>';cervantesItems.forEach(item=>{if(domains[item.id])html+=`<div class="domain-row">${domains[item.id]}</div>`;const disabled=item.partner&&!hasPartner;html+=`<div class="scale-row ${disabled?'disabled':''}"><div class="scale-cell scale-question"><div><strong>${item.id}. ${item.text}</strong><small>${item.left} → ${item.right}</small></div></div>${[0,1,2,3,4,5].map(v=>`<label class="scale-cell score-button"><input type="radio" name="c${item.id}" value="${v}" ${disabled?'disabled':''}><span>${v}</span></label>`).join('')}</div>`});$('cervantes-items').innerHTML=html;qsa('#cervantes-items input[type="radio"]').forEach(r=>r.addEventListener('change',computeCervantes))}
function getItemValue(i){const checked=document.querySelector(`input[name="c${i}"]:checked`);return checked?Number(checked.value):null}
function computeCervantes(){const hasPartner=$('hasPartner').checked, required=hasPartner?16:14;let values={};for(let i=1;i<=required;i++){const v=getItemValue(i);if(v===null){$('cervantes-conclusion').className='conclusion empty';$('cervantes-conclusion').textContent=`Faltan ítems por completar. Ítems respondidos: ${Object.keys(values).length}/${required}.`;$('cervantes-actions').hidden=true;state.cervantes=null;updateSummary();return}values[i]=v}
 const sum=(a,b)=>{let s=0;for(let i=a;i<=b;i++)s+=values[i];return s};
 // Puntuaciones directas (ítems 13–16 invertidos: mayor puntuación = peor calidad de vida)
 const msRaw=sum(1,9), psiRaw=sum(10,12), sexRaw=(5-values[13])+(5-values[14]), parejaRaw=hasPartner?(5-values[15])+(5-values[16]):null, globalRaw=msRaw+psiRaw+sexRaw+(parejaRaw??0), globalMax=hasPartner?80:70;
 // Escala 0–100: transformación lineal de la puntuación directa (directa / máximo × 100)
 const vaso=(values[1]+values[2])*10, salud=(values[3]+values[4]+values[5])*100/15, env=(values[6]+values[7]+values[8]+values[9])*5, ms=round(msRaw*100/45), psi=round(psiRaw*100/15), sex=round(sexRaw*10), pareja=hasPartner?round(parejaRaw*10):null, global=round(globalRaw*100/globalMax);
 state.cervantes={vaso:round(vaso),salud:round(salud),envejecimiento:round(env),ms,psi,sex,pareja,global,msRaw,psiRaw,sexRaw,parejaRaw,globalRaw,globalMax};
 const msValue=CERVANTES_CUTOFF.scale==='directa'?msRaw:ms;const pharmacologic=msValue>CERVANTES_CUTOFF.value;state.cervantes.pharmacologic=pharmacologic;
 const scaleTxt=CERVANTES_CUTOFF.scale==='directa'?`puntuación directa ${msRaw}/45`:`puntuación transformada ${ms}/100`;
 $('cervantes-conclusion').className=pharmacologic?'conclusion amber':'conclusion';$('cervantes-conclusion').innerHTML=`<div class="impact-hero"><div class="impact-icon ${pharmacologic?'amber':''}">${pharmacologic?'⚠️':'✓'}</div><div><p class="impact-title">${pharmacologic?'Impacto moderado-severo':'Impacto leve'}</p><div>${pharmacologic?'Valorar tratamiento farmacológico':'Iniciar medidas no farmacológicas'}</div></div></div><div class="score-grid"><div class="score-box"><span>Menopausia + Salud</span><strong>${ms}<small>/100</small></strong></div><div class="score-box"><span>Vasomotor</span><strong>${state.cervantes.vaso}<small>/100</small></strong></div><div class="score-box"><span>Psíquico</span><strong>${psi}<small>/100</small></strong></div><div class="score-box"><span>Sexualidad</span><strong>${sex}<small>/100</small></strong></div><div class="score-box"><span>Global</span><strong>${global}<small>/100</small></strong></div></div><p class="hint">Puntuaciones directas: M+S ${msRaw}/45 · vasomotor ${values[1]+values[2]}/10 · psíquico ${psiRaw}/15 · sexualidad ${sexRaw}/10${hasPartner?' · pareja '+parejaRaw+'/10 (transformada '+pareja+')':''} · global ${globalRaw}/${globalMax}. Transformación: directa / máximo × 100.</p><p><strong>Implicación:</strong> Menopausia + Salud ${scaleTxt} (corte >${CERVANTES_CUTOFF.value}; S 81,9 % y E 77,9 % para síndrome vasomotor moderado-grave; Coronado et al., Menopause 2021). ${pharmacologic?'Apoya valorar tratamiento farmacológico.':'Permite iniciar hábitos saludables y/o productos naturales, con reevaluación.'}${(!pharmacologic&&state.cervantes.vaso>CERVANTES_CUTOFF.value)?' <strong>Atención:</strong> la subdimensión vasomotora supera 25 (AUC 0,923 en el mismo estudio); valorar tratamiento farmacológico si los sofocos son el motivo principal de consulta.':''}</p>${!pharmacologic?'<div class="pill-row"><span class="pill">Hábitos saludables</span><span class="pill">Productos naturales</span><span class="pill">Reevaluar 8–12 semanas</span></div>':''}`;
 $('cervantes-actions').hidden=false;$('btn-finish-natural').style.display=pharmacologic?'none':'inline-flex';updateSummary()}

/* ---------- Ruta ---------- */
function prepareRoute(){if(!state.cervantes)return;state.route=(state.amenorrhea==='lt12'&&state.needsContraception)?'contraception':'thm';state.eligibility=null;renderRoute()}
function renderRoute(){let html='';if(state.route==='contraception')html+=cardHTML('Ruta anticonceptiva','Amenorrea <12 meses y necesidad anticonceptiva. Se aplican los criterios médicos de elegibilidad de la OMS (6.ª ed., 2025) método a método, con la categoría de inicio. Nota de la herramienta (no OMS): si la AHC es elegible, se sugieren preparados con E2/estetrol.',true);else html+=cardHTML('Ruta THM','Sin necesidad anticonceptiva o menopausia establecida. Se aplican los criterios AEEM por tipo y vía de THM, más las contraindicaciones de ficha técnica.',true);if(!state.cervantes?.pharmacologic)html+=cardHTML('Rama no farmacológica disponible','El dominio Menopausia + Salud está por debajo del umbral: puede finalizarse con hábitos saludables y productos naturales si la paciente no desea tratamiento farmacológico.',false);$('route-cards').innerHTML=html;$('route-conclusion').className=state.continueLate?'conclusion amber':'conclusion';$('route-conclusion').innerHTML=`<h3>Ruta seleccionada: ${state.route==='contraception'?'anticoncepción':'THM'}</h3>${routeText()}`;updateSummary()}
function cardHTML(title,body,selected){return`<div class="route-card ${selected?'selected':''}"><h3>${title}</h3><p>${body}</p></div>`}
function routeText(){if(state.route==='contraception')return 'Cada método se evalúa con su propia categoría OMS: un método alternativo solo se propone si también es elegible.';let txt=state.hasUterus?'Tiene útero: la THM estrogénica debe asociar gestágeno (o bazedoxifeno).':'No tiene útero: pueden usarse estrógenos solos.';if(state.continueLate)txt+=' '+lateCategory3Text();return txt}

/* ---------- Elegibilidad ---------- */
function checkRow(c,group){return `<label title="${c.note||''}"><input type="checkbox" data-group="${group}" value="${c.id}" ${c.group?`data-excl="${c.group}"`:''}> ${c.label}</label>`}
function renderEligibility(){const box=$('eligibility-form'), isACO=state.route==='contraception';let html=`<div class="grid two"><div class="card"><h3>${isACO?'Criterios OMS por método anticonceptivo':'Criterios AEEM por tipo y vía de THM'}</h3><p class="hint">Marque las situaciones presentes. La herramienta calcula la categoría de cada opción (1–2: elegible; 3: uso excepcional; 4: contraindicada; NA o sin cifra: individualizar). ${isACO?'Edad ≥40 años: AHC categoría 2 de base (OMS). Se muestra la categoría de inicio (I) y, cuando difiere, la de continuación (C).':'La edad se aplica automáticamente (fila «Edad y duración», duración de THM <5 años al iniciar). Los valores dobles con asterisco se ofrecen como supuestos separados.'}</p></div><div class="card"><label class="inline-check"><input type="checkbox" id="noCriteria"> No presenta ninguna de las situaciones listadas</label></div></div>`;
 if(isACO){html+=`<h3>Condiciones clínicas <span class="src-tag oms">OMS MEC 6.ª ed. (2025) · literal</span></h3><div class="check-grid">${ACO_CONDITIONS.map(c=>checkRow(c,'cond')).join('')}</div>`}
 else{html+=`<h3>Condiciones con categoría AEEM <span class="src-tag aeem">AEEM · tabla resumen · literal</span></h3>`+THM_GROUPS.map(g=>`<h4 class="group-title">${g.title}</h4><div class="check-grid">${g.rows.map(c=>checkRow(c,'cond')).join('')}</div>`).join('')+`<h3>Contraindicaciones de ficha técnica <span class="src-tag tool">Complemento de la herramienta · no forma parte de los criterios AEEM</span></h3><div class="check-grid">${THM_FT_CONTRA.map(c=>checkRow(c,'ft')).join('')}</div><h3>Precauciones (modifican la vía preferente) <span class="src-tag tool">Complemento de la herramienta (ficha técnica) · no AEEM</span></h3><div class="check-grid">${THM_PRECAUTIONS.map(c=>checkRow(c,'prec')).join('')}</div>`}
 html+=`<h3>Seguridad de tratamientos no hormonales <span class="src-tag tool">Complemento de la herramienta (ficha técnica/EMA) · no AEEM/OMS</span></h3><div class="check-grid">${NH_CHECKS.map(c=>checkRow(c,'nh')).join('')}</div>`;
 box.innerHTML=html;
 $('noCriteria').addEventListener('change',e=>{if(e.target.checked)qsa('#eligibility-form input[type="checkbox"][data-group]').forEach(cb=>cb.checked=false)});
 qsa('#eligibility-form input[type="checkbox"][data-group]').forEach(cb=>cb.addEventListener('change',()=>{if(cb.checked){$('noCriteria').checked=false;if(cb.dataset.excl)qsa(`#eligibility-form input[data-excl="${cb.dataset.excl}"]`).forEach(o=>{if(o!==cb)o.checked=false})}}))}

function thmAgeRow(age,amen){let c,lab;
 if(age<45){c={combTD:'1',combOral:'2',estrTD:'1',estrOral:'2',tib:'2|2**'};lab='40-44'}
 else if(age<50){c={combTD:'2',combOral:'2',estrTD:'1',estrOral:'2',tib:'2|2**'};lab='45-49'}
 else if(age<60){c={combTD:'2',combOral:'2',estrTD:'2',estrOral:'2',tib:age<55?'2|2 (<55)':'1|1 (>55)'};lab='50-59'}
 else if(age<70){const d=amen==='gt10'?'3':'IND';c={combTD:d+'|2/3***',combOral:d+'|2/3***',estrTD:d+'|2/3***',estrOral:d+'|2/3***',tib:'2'};lab='60-69'}
 else{c={combTD:'3',combOral:'3',estrTD:'3',estrOral:'3',tib:'2'};lab='> 70'}
 return{id:'edad',label:`Edad y duración: ${lab} años, <5 años de THM`,cats:c,note:age>=60&&age<70?'AEEM: *** Continuación de la THM (Categoría 2) / inicio de la THM por encima de los 10 años de la menopausia (Categoría 3).':(age<50?'AEEM: ** La evidencia disponible es baja por el limitado número de casos.':'')}}
function evaluateMatrix(cols,rows){const out={};Object.keys(cols).forEach(k=>{let max=0,na=false,reasons=[];rows.forEach(r=>{let v=r.cats[k];if(k==='tsec'&&v==null&&r.cats.estrOral!=null&&!r.noExt){const p=parseCat(r.cats.estrOral);v=p.src==='NA'?'NA|NA (ext.)':(p.n===2.5?'IND':p.n===3.5?'SEV':String(p.n))+'EXT'}if(v==null)return;const p=parseCat(v);if(p.src==='NA'){na=true;reasons.push({label:r.label,v});return}if(p.n>=2||p.lit)reasons.push({label:r.label,v});if(p.n>max)max=p.n});const status=max>=4?'contra':max===3.5?'clinical':max===3?'exceptional':(max===2.5||na)?'individual':'eligible';out[k]={max,na,status,reasons,ft:[]}});return out}

function validateEligibility(){
 const condIds=qsa('#eligibility-form input[data-group="cond"]:checked').map(x=>x.value), precIds=qsa('#eligibility-form input[data-group="prec"]:checked').map(x=>x.value), ftIds=qsa('#eligibility-form input[data-group="ft"]:checked').map(x=>x.value), nhIds=qsa('#eligibility-form input[data-group="nh"]:checked').map(x=>x.value), none=$('noCriteria')?.checked;
 if(!none&&!condIds.length&&!precIds.length&&!nhIds.length&&!ftIds.length){flash($('eligibility-conclusion'),'Marque “no presenta ninguna” o seleccione los criterios presentes.');return}
 const isACO=state.route==='contraception';let rows=[],cols,prec=[];
 if(isACO){cols=ACO_COLS;rows.push({id:'edad40',label:'Edad ≥40 años',cats:{ahc:'2',lng:'1',pop:'1',cu:'1'}});rows=rows.concat(ACO_CONDITIONS.filter(c=>condIds.includes(c.id)))}
 else{cols=state.hasUterus?{combTD:THM_COLS.combTD,combOral:THM_COLS.combOral,tib:THM_COLS.tib,tsec:THM_COLS.tsec}:{estrTD:THM_COLS.estrTD,estrOral:THM_COLS.estrOral,tib:THM_COLS.tib};rows.push(thmAgeRow(state.age,state.amenorrhea));rows=rows.concat(THM_CONDITIONS.filter(c=>condIds.includes(c.id)));prec=THM_PRECAUTIONS.filter(p=>precIds.includes(p.id))}
 const evalCols=evaluateMatrix(cols,rows);
 const allCond=isACO?ACO_CONDITIONS:THM_CONDITIONS;const checked=allCond.filter(c=>condIds.includes(c.id));
 // Complemento de ficha técnica (no AEEM): marca columnas sin cambiar la categoría AEEM
 let ftList=[];if(!isACO){const keys=new Set([...THM_FT_CONTRA.filter(f=>ftIds.includes(f.id)).map(f=>f.key),...checked.filter(c=>c.ft).map(c=>c.ft)]);ftList=THM_FT_CONTRA.filter(f=>keys.has(f.key)).map(f=>f.label);Object.keys(evalCols).forEach(k=>{if(ftList.length)evalCols[k].ft.push(...ftList)});if(state.amenorrhea==='lt12'){['tib','tsec'].forEach(k=>{if(evalCols[k])evalCols[k].ft.push('Amenorrea <12 meses (tibolona y TSEC requieren ≥12 meses desde la última regla)')})}}
 const nh={hep:nhIds.includes('nhHep')||checked.some(c=>c.hep)||THM_FT_CONTRA.some(f=>f.hep&&ftIds.includes(f.id)),cyp:nhIds.includes('nhCyp'),renal:nhIds.includes('nhRenal'),tamox:nhIds.includes('nhTamox')||checked.some(c=>c.nh==='tamox'||c.id==='serms')||ftIds.includes('ftMama')};
 const main=isACO?evalCols.ahc:Object.entries(evalCols).filter(([k])=>k!=='tib'&&k!=='tsec').map(([,v])=>v).sort((a,b)=>a.max-b.max)[0];
 const anyHormEligible=Object.values(evalCols).some(v=>v.status==='eligible');
 const level=isACO?(evalCols.ahc.status==='eligible'?(checked.some(c=>parseCat(c.cats.ahc).n>=2)?'yellow':'green'):'red'):(main.status==='eligible'&&!main.ft.length?((checked.length||prec.length)?'yellow':'green'):((anyHormEligible||main.status==='individual'||main.status==='exceptional')?'yellow':'red'));
 state.eligibility={route:state.route,cols,evalCols,rows,checked,prec,nh,nhIds,ftList,level,absLabels:checked.filter(c=>Object.values(c.cats).some(v=>parseCat(v).n===4)).map(c=>c.label),relLabels:[...checked.filter(c=>!Object.values(c.cats).some(v=>parseCat(v).n===4)).map(c=>c.label),...prec.map(p=>p.label)],lateAuto:!isACO&&state.age>=60};
 let msg;if(isACO){msg=evalCols.ahc.status==='eligible'?'AHC elegible (categoría ≤2). Preferir E2/estetrol frente a etinilestradiol.':`AHC: ${statusText(evalCols.ahc.status)}. Se proponen solo métodos con categoría ≤2; los sofocos se tratarán por vía no hormonal o THM individualizada.`}
 else{msg=main.status==='eligible'?`THM sistémica elegible según AEEM para al menos una vía (categoría ${main.max}).`:main.status==='individual'?'Sin cifra AEEM aplicable (NA o supuesto a individualizar) para la THM estrogénica: valoración individual.':main.status==='exceptional'?'THM estrogénica en categoría 3 AEEM: uso excepcional tras decisión compartida; se presentan alternativas no hormonales.':main.status==='clinical'?'Categoría AEEM dependiente de la gravedad: valoración clínica.':'THM sistémica en categoría 4 AEEM. Se proponen alternativas no hormonales.'; if(ftList.length)msg+=' <strong>Ficha técnica (complemento):</strong> '+ftList.join('; ')+'.'}
 let detail=catTableHTML(cols,evalCols);if(state.eligibility.lateAuto)detail+=`<div class="warning-box"><strong>${state.age<70?'60-69 años: 2/3*** (AEEM)':'> 70 años: categoría 3 (AEEM)'}</strong><br>${lateCategory3Text()}</div>`;if(prec.length)detail+=`<div class="warning-box"><strong>Precauciones</strong> <span class="src-tag tool">complemento de la herramienta · no AEEM</span><br>${prec.map(p=>`${p.label}: ${p.note}`).join('<br>')}</div>`;const nhNotes=nhWarnings(nh);if(nhNotes.length)detail+=`<div class="warning-box"><strong>Tratamientos no hormonales</strong> <span class="src-tag tool">complemento de la herramienta · ficha técnica/EMA</span><br>${nhNotes.join('<br>')}</div>`;
 $('eligibility-conclusion').className=level==='red'?'conclusion red':level==='yellow'?'conclusion amber':'conclusion';$('eligibility-conclusion').innerHTML=`<h3>${eligibilityLabel()}</h3><p>${msg}</p>${detail}`;
 state.treatment=null;renderTreatmentOptions();unlockStation('station-treatment');updateSummary();goTo('station-treatment')}
function statusText(s){return{eligible:'elegible',exceptional:'uso excepcional (categoría 3)',individual:'individualizar (NA o sin cifra en la tabla)',clinical:'según gravedad (valoración clínica; no se propone)',contra:'contraindicada (categoría 4)',na:'sin categoría'}[s]}
function catTableHTML(cols,ev){const thm=state.route!=='contraception';return `<table class="cat-table"><thead><tr><th>Opción</th><th>Categoría ${thm?'AEEM':'OMS'}</th><th>Situación</th><th>Motivos (valor literal)</th>${thm?'<th>Ficha técnica <span class="src-tag tool">complemento</span></th>':''}</tr></thead><tbody>${Object.entries(cols).map(([k,label])=>{const e=ev[k];const cls=e.status==='individual'?'na':Math.ceil(e.max);return `<tr><td>${label}</td><td><span class="cat-badge c${cls}">${maxLabel(e.max,state.route)}${e.na&&e.max<=2?' / NA':''}</span></td><td>${statusText(e.status)}</td><td>${e.reasons.map(r=>`${r.label} (${catLabel(r.v)})`).join('; ')||'—'}</td>${thm?`<td>${e.ft.length?'<strong>Contraindicada en ficha técnica:</strong> '+e.ft.join('; '):'—'}</td>`:''}</tr>`}).join('')}</tbody></table><p class="hint src-legend">${catLegend()}</p>`}
function catLegend(){return state.route==='contraception'?'Categorías sin marca: OMS MEC 6.ª ed. (2025), literales (I = inicio, C = continuación; 3/4 = según gravedad). Traducción no oficial.':'Categorías: AEEM, Criterios de elegibilidad de la THM, tabla resumen (valores literales entre paréntesis; NA = no aplicable por falta de evidencia disponible). Cuando la celda es doble (p. ej., 3/2*), la herramienta aplica el supuesto marcado; «1/2» se trata como 2. La columna «Ficha técnica» y la extrapolación «(ext.)» para TSEC son complementos de la herramienta y no forman parte de los criterios AEEM.'}
function nhWarnings(nh){const w=[];if(nh.hep)w.push('Hepatopatía/alteración hepática: fezolinetant no se inicia y se evita cimicífuga.');if(nh.cyp)w.push('Inhibidor de CYP1A2: fezolinetant contraindicado.');if(nh.renal)w.push('ERC grave: fezolinetant no recomendado; ajustar gabapentina.');if(nh.tamox)w.push('Tamoxifeno o cáncer de mama: evitar paroxetina/fluoxetina; preferir venlafaxina, citalopram/escitalopram o gabapentina.');return w}
function eligibilityLabel(){if(!state.eligibility)return 'Pendiente';return state.eligibility.level==='red'?'No favorable':state.eligibility.level==='yellow'?'Precaución':'Favorable'}

/* ---------- Tratamiento ---------- */
function neurokininAllowed(){const nh=state.eligibility?.nh||{};return !(nh.hep||nh.cyp||nh.renal)}
/* Presentación según criterio AEEM: las opciones se agrupan por categoría y, dentro de una misma categoría, no se jerarquizan.
   No se antepone la pauta cíclica a la continua: se informa del patrón de sangrado de cada una. */
function recommendedTreatments(){
 const empty={byCat:{},exceptional:[],individual:[],offlabel:[],nonHorm:[],excluded:[]};
 if(state.naturalFinal||state.route==='natural'||!state.eligibility)return{...empty,nonHorm:['natural']};
 const ev=state.eligibility.evalCols, r={byCat:{},exceptional:[],individual:[],offlabel:[],nonHorm:[],excluded:[]};
 const add=(k)=>{const col=treatmentLibrary[k].col, e=ev[col];if(!e)return;
  if(e.status==='contra'){r.excluded.push({k,why:'categoría 4'});return}
  if(e.status==='clinical'){r.excluded.push({k,why:state.route==='contraception'?'OMS categoría 3/4: depende de la gravedad, requiere valoración clínica individual':'AEEM: categoría según gravedad, requiere valoración clínica individual'});return}
  if(e.ft&&e.ft.length){r.offlabel.push(k);return}
  if(e.status==='eligible'){(r.byCat[e.max]=r.byCat[e.max]||[]).push(k)}else if(e.status==='exceptional')r.exceptional.push(k);else r.individual.push(k)};
 if(state.route==='contraception'){['contraceptionE2','contraceptionLNG','contraceptionPOP','contraceptionCu'].forEach(add);r.nonHorm=['nonHormonal','natural'];return r}
 const order=state.hasUterus?['combinedCyclic','combinedContinuous','combinedCyclicOral','combinedContinuousOral','tibolone','tsec']:['estrogenOnlyTD','estrogenOnlyOral','tibolone'];
 order.forEach(add);
 if(neurokininAllowed())r.nonHorm.push('neurokinin');else r.excluded.push({k:'neurokinin',why:'hepatopatía, inhibidor de CYP1A2 o ERC grave (ficha técnica)'});
 r.nonHorm.push('nonHormonal','natural');return r}
function allTreatmentKeys(r){return [...Object.values(r.byCat).flat(),...r.exceptional,...r.individual,...r.offlabel,...r.nonHorm]}
function renderTreatmentOptions(){const r=recommendedTreatments(), all=allTreatmentKeys(r);if(state.treatment&&!all.includes(state.treatment))state.treatment=null;if(state.naturalFinal)state.treatment='natural';let html='';const el=state.eligibility;
 if(el&&el.level!=='green'){const notes=[];if(el.lateAuto)notes.push(lateCategory3Text());if(el.relLabels?.length)notes.push('Situaciones marcadas: '+el.relLabels.join('; ')+'.');if(el.absLabels?.length)notes.push('Contraindicaciones: '+el.absLabels.join('; ')+'.');html+=`<div class="precaution-banner"><strong>${el.level==='red'?(state.route==='contraception'?'AHC no elegible.':'Ninguna THM en categoría 1–2.'):'Elegibilidad con precaución.'}</strong> ${notes.join(' ')}</div>`}
 if(el)html+=`<p class="hint">Las opciones se agrupan por categoría ${state.route==='contraception'?'OMS':'AEEM'}. Dentro de una misma categoría no se establece preferencia: la elección corresponde a la decisión compartida con la paciente.${state.route==='thm'&&state.hasUterus?' En la THM combinada, informe a la paciente de que con la pauta cíclica tendrá un sangrado programado y con la continua el objetivo es no sangrar, aunque puede haber sangrado irregular, sobre todo al inicio.':''}</p>`;
 Object.keys(r.byCat).map(Number).sort((a,b)=>a-b).forEach(c=>{html+=`<h3 class="treatment-section-title">Categoría ${c}${c===1?' — sin restricción':' — las ventajas superan a los riesgos'}</h3>`+r.byCat[c].map(k=>treatmentCard(k)).join('')});
 if(r.exceptional.length)html+=`<h3 class="treatment-section-title">Categoría 3 — uso excepcional</h3><p class="hint">Los riesgos generalmente superan a los beneficios: solo si no hay alternativa aceptable, tras decisión compartida documentada.</p>`+r.exceptional.map(k=>treatmentCard(k,true)).join('');
 if(r.individual.length)html+=`<h3 class="treatment-section-title">Individualizar (NA o sin cifra en la tabla AEEM)</h3><p class="hint">La AEEM no asigna categoría numérica aplicable (falta de evidencia o supuesto a valorar): decisión clínica individual.</p>`+r.individual.map(k=>treatmentCard(k,true)).join('');
 if(r.offlabel.length)html+=`<h3 class="treatment-section-title">Valorable según AEEM, contraindicado en ficha técnica <span class="src-tag tool">complemento de la herramienta</span></h3><p class="hint">La categoría AEEM permite valorar su uso (ver categoría de cada opción), pero la ficha técnica lo contraindica: uso fuera de ficha técnica, con consentimiento informado y decisión documentada.</p>`+r.offlabel.map(k=>treatmentCard(k,true)).join('');
 if(r.nonHorm.length)html+=`<h3 class="treatment-section-title">${el?'Alternativas no hormonales':'Medidas no farmacológicas'} <span class="src-tag tool">sin categoría ${state.route==='contraception'?'OMS':'AEEM'}</span></h3>`+r.nonHorm.map(k=>treatmentCard(k)).join('');
 if(r.excluded.length)html+=`<details class="details-soft"><summary>Opciones no propuestas (${r.excluded.length})</summary><ul>${r.excluded.map(x=>`<li><strong>${treatmentLibrary[x.k].title}</strong>: ${x.why}.</li>`).join('')}</ul></details>`;
 $('treatment-options').innerHTML=html;qsa('.treatment-card').forEach(card=>card.addEventListener('click',()=>selectTreatment(card.dataset.key)));if(state.treatment)selectTreatment(state.treatment);else{$('treatment-conclusion').className='conclusion empty';$('treatment-conclusion').textContent='Seleccione la opción acordada con la paciente.';updateSummary()}}
function oralNote(key){const ORAL=['estrogenOnlyOral','tsec','combinedCyclicOral','combinedContinuousOral'];const pr=(state.eligibility?.prec||[]).filter(p=>p.demoteOral);return ORAL.includes(key)&&pr.length?` <span class="src-tag tool">complemento</span> Con ${pr.map(p=>p.label.toLowerCase()).join(', ')}, la ficha técnica aconseja preferir la vía transdérmica.`:''}
function brandFor(key){const t=treatmentLibrary[key];if(key==='natural'&&state.eligibility?.nh?.hep)return 'Solo hábitos saludables: evitar cimicífuga por hepatopatía';return t.brand}
function catBadgeFor(key){const col=treatmentLibrary[key].col, e=state.eligibility?.evalCols?.[col];return e?`<span class="cat-badge c${e.status==='individual'?'na':Math.ceil(e.max)}">Cat. ${maxLabel(e.max,state.route)}</span> `:''}
function treatmentCard(key,exceptional=false){const t=treatmentLibrary[key],r=treatmentRationale(key)+oralNote(key),brand=brandFor(key);return`<div class="treatment-card ${exceptional?'exceptional':''}" data-key="${key}"><input type="radio" name="treatment" ${state.treatment===key?'checked':''}><h3>${catBadgeFor(key)}${t.title}</h3><p>${r}</p><div class="pill-row"><span class="pill">${brand.split(';')[0]}</span></div><details class="details-soft"><summary>Ver ejemplo y recomendaciones</summary><div class="treatment-meta"><div class="mini-box"><strong>Ejemplo de marca/presentación</strong>${brand}</div><div class="mini-box"><strong>Recomendación paciente</strong>${t.patient}</div></div></details></div>`}
function treatmentRationale(key){const nh=state.eligibility?.nh||{};return{
 natural:'Rama no farmacológica: especialmente si Cervantes Menopausia + Salud está por debajo del umbral o la paciente prefiere evitar tratamiento farmacológico.',
 contraceptionE2:'Cubre anticoncepción y mejora los síntomas vasomotores. Preferir E2/estetrol frente a etinilestradiol.',
 contraceptionLNG:'Anticoncepción sin estrógenos de larga duración. Si persisten los sofocos y la paciente es elegible para THM, permite añadir estradiol transdérmico con protección endometrial.',
 contraceptionPOP:'Anticoncepción oral sin estrógenos. No trata los sofocos: asociar tratamiento sintomático si precisa.',
 contraceptionCu:'Anticoncepción no hormonal cuando los métodos hormonales no son elegibles o la paciente los rechaza.',
 estrogenOnlyTD:'Paciente sin útero: estrógenos solos por vía transdérmica, sin gestágeno.',
 estrogenOnlyOral:'Paciente sin útero: estrógenos solos por vía oral, sin gestágeno.',
 combinedCyclic:'Paciente con útero. Pauta secuencial o cíclica: estrógeno diario y gestágeno 12–14 días al mes; produce un sangrado programado mensual.',
 combinedContinuous:'Paciente con útero. Pauta continua: estrógeno y gestágeno diarios; el objetivo es no sangrar, aunque puede haber sangrado irregular, sobre todo en los primeros meses y si la última regla es reciente.',
 combinedCyclicOral:'Paciente con útero. Pauta secuencial o cíclica por vía oral: produce un sangrado programado mensual.'+(state.eligibility?.checked?.some(c=>c.id==='hta')?' Hipertensión: AEEM asigna categoría 1 a la combinación estradiol + drospirenona (pauta continua).':''),
 combinedContinuousOral:'Paciente con útero. Pauta continua por vía oral: el objetivo es no sangrar, aunque puede haber sangrado irregular, sobre todo en los primeros meses y si la última regla es reciente.'+(state.eligibility?.checked?.some(c=>c.id==='hta')?' Hipertensión: AEEM asigna categoría 1 a estradiol + drospirenona.':''),
 tibolone:'Posmenopausia (≥12 meses de amenorrea), especialmente si predominan sueño, ánimo o sexualidad. En ≥60 años: aumento de ictus en el ensayo LIFT; individualizar (nota de la herramienta, no AEEM).',
 tsec:'Mujer con útero y ≥12 meses de amenorrea, con mala tolerancia o preferencia por evitar gestágenos. Sin categoría AEEM propia: la herramienta extrapola la del estrógeno oral (complemento, no AEEM).',
 neurokinin:'Alternativa no hormonal específica para sofocos. Requiere analítica hepática basal y control en los primeros meses (FT/EMA 2024).'+(state.amenorrhea==='lt12'?' Evidencia principalmente en posmenopausia.':''),
 nonHormonal:'Alternativa no hormonal sintomática.'+(nh.tamox?' Con tamoxifeno, evitar paroxetina/fluoxetina.':'')
}[key]||''}
function selectTreatment(key){state.treatment=key;qsa('.treatment-card').forEach(c=>c.classList.toggle('selected',c.dataset.key===key));qsa('.treatment-card input').forEach(i=>i.checked=i.closest('.treatment-card').dataset.key===key);const rt=recommendedTreatments();const exc=rt.exceptional.includes(key)||rt.individual.includes(key)||rt.offlabel.includes(key);const ec=treatmentLibrary[key].col&&state.eligibility?.evalCols?.[treatmentLibrary[key].col];$('treatment-conclusion').className=exc?'conclusion amber':'conclusion';$('treatment-conclusion').innerHTML=`<h3>Tratamiento seleccionado</h3>${treatmentLibrary[key].title}${ec?' (categoría '+maxLabel(ec.max,state.route)+')':''}. ${treatmentRationale(key)}${exc?' <strong>'+(rt.offlabel.includes(key)?'Contraindicado en ficha técnica (complemento de la herramienta): uso fuera de ficha técnica':rt.individual.includes(key)?'Individualizar (sin cifra AEEM aplicable)':'Uso excepcional (categoría 3)')+': documentar la decisión compartida.</strong>':''}`;updateSummary()}

/* ---------- Informe ---------- */
function categoryLines(){const el=state.eligibility;if(!el)return '';return '\nCategorías: '+Object.entries(el.cols).map(([k,l])=>{const e=el.evalCols[k];return `${l} ${maxLabel(e.max,state.route)}${e.ft&&e.ft.length?' [contraindicada en ficha técnica]':''}`}).join('; ')+'.'+(el.checked.length?`\nSituaciones marcadas: ${el.checked.map(c=>c.label).join('; ')}.`:'')+(el.prec.length?`\nPrecauciones: ${el.prec.map(p=>p.label).join('; ')}.`:'')+(nhWarnings(el.nh).length?`\nNo hormonales: ${nhWarnings(el.nh).join(' ')}`:'')}
function generateReports(){const key=state.treatment||'natural',t=treatmentLibrary[key],c=state.cervantes,pauta=pautaText(),elig=state.eligibility?eligibilityLabel():'No aplicable';const rt2=state.eligibility?recommendedTreatments():null;const exc=rt2?(rt2.exceptional.includes(key)||rt2.individual.includes(key)||rt2.offlabel.includes(key)):false;const trans=transdermalText(),safety=state.eligibility?.lateAuto?' '+lateCategory3Text():(state.continueLate?' '+lateSafetyText():'');
 const cerv=c?`dominio Menopausia + Salud ${c.ms}/100 (directa ${c.msRaw}/45; corte >25, Coronado et al., Menopause 2021); vasomotor ${c.vaso}/100; puntuación global ${c.global}/100. Interpretación: ${c.pharmacologic?'impacto moderado-severo, se valora tratamiento farmacológico según algoritmo AEEM.':'impacto leve, se plantean hábitos saludables y/o productos naturales con reevaluación.'}`:'—';
 const srcNote=state.eligibility?`\nFuentes: ${catLegend()}`:'';
 const report=`Algoritmo terapéutico de sofocos en menopausia.\n\nPaciente de ${state.age||'—'} años, con amenorrea ${amenorrheaLabel(state.amenorrhea)}.${state.amenorrhea==='lt12'?` Necesidad anticonceptiva: ${state.needsContraception?'sí':'no'}.`:''} ${state.hasUterus===null?'':state.hasUterus?'Útero presente.':'Histerectomizada / sin útero.'}\n\nEscala Cervantes SFv2: ${cerv}\n\nRuta: ${state.route==='contraception'?'anticonceptiva con criterios OMS':state.route==='thm'?'THM con criterios AEEM y ficha técnica':'no farmacológica'}. Elegibilidad: ${elig}.${categoryLines()}${srcNote}${safety}${trans}\n\nTratamiento seleccionado: ${t.title}${exc?' ('+(rt2.offlabel.includes(key)?'FUERA DE FICHA TÉCNICA':rt2.individual.includes(key)?'INDIVIDUALIZADO, sin cifra AEEM aplicable':'USO EXCEPCIONAL, categoría 3')+': decisión compartida documentada)':''}.\nPauta orientativa: ${pauta}\nEjemplo: ${brandFor(key)}.\n\nSe explican beneficios esperados, alternativas, signos de alarma y necesidad de revisión periódica. Esta herramienta no sustituye el juicio clínico ni la ficha técnica de los medicamentos.`;
 const patient=`${t.patient}\n\nHábitos recomendados:\n- ${habits.join('\n- ')}\n\nSignos de alarma generales: consulte si presenta sangrado vaginal no esperado, dolor torácico, dificultad respiratoria, dolor intenso en una pierna, cefalea intensa de nueva aparición, alteraciones visuales o síntomas neurológicos.\n\nSeguimiento: revisar respuesta, tolerancia y adherencia en 8–12 semanas o antes si aparecen efectos adversos.`;
 $('clinical-report').value=report;$('patient-report').value=patient;$('pauta-report').value=pauta;renderFinalSummary();updateSummary()}
function renderFinalSummary(){const c=state.cervantes,t=state.treatment?treatmentLibrary[state.treatment]:null;const impacto=c?(c.pharmacologic?'Moderado-severo':'Leve'):'—';const elig=state.eligibility?eligibilityLabel():(state.route==='natural'?'No aplicable':'—');const route=state.route==='contraception'?'Anticoncepción':state.route==='thm'?'THM':'No farmacológica';$('final-summary').innerHTML=`<div class="final-tile highlight"><span>Impacto Cervantes</span><strong>${impacto}</strong></div><div class="final-tile"><span>Ruta</span><strong>${route}</strong></div><div class="final-tile ${elig==='Precaución'?'amber':''}"><span>Elegibilidad</span><strong>${elig}</strong></div><div class="final-tile"><span>Útero</span><strong>${state.hasUterus===null?'—':state.hasUterus?'Sí':'No'}</strong></div><div class="final-tile highlight"><span>Tratamiento</span><strong>${t?t.title:'—'}</strong></div><div class="final-tile"><span>Pauta</span><strong>${pautaText()}</strong></div>`}
function transdermalText(){return ''}
function pautaText(){switch(state.treatment){case'natural':return state.eligibility?.nh?.hep?'Hábitos de vida saludable (evitar cimicífuga por hepatopatía); reevaluar en 8–12 semanas.':'Hábitos de vida saludable + producto natural seleccionado; reevaluar respuesta en 8–12 semanas.';case'contraceptionE2':return'AHC con E2 o estetrol según ficha técnica y criterios OMS; reevaluar sofocos, sangrado y tolerancia en 8–12 semanas.';case'contraceptionLNG':return'DIU-LNG 52 mg; si persisten sofocos y es elegible para THM, valorar estradiol transdérmico (el DIU aporta protección endometrial durante su vigencia según ficha técnica).';case'contraceptionPOP':return'Gestágeno solo oral diario según ficha técnica; si persisten sofocos, asociar tratamiento no hormonal.';case'contraceptionCu':return'DIU de cobre; sofocos con medidas y fármacos no hormonales.';case'estrogenOnlyTD':return'Estradiol transdérmico a dosis baja/estándar según intensidad y respuesta; no precisa gestágeno al no tener útero.';case'estrogenOnlyOral':return'Estradiol/valerato de estradiol oral a dosis baja/estándar según intensidad y respuesta; no precisa gestágeno al no tener útero.';case'combinedCyclic':return'Estradiol diario + progesterona micronizada 200 mg VO nocturna 12–14 días/mes; sangrado programado esperable.';case'combinedContinuous':return'Estradiol diario + progesterona micronizada 100 mg VO nocturna diaria; objetivo de amenorrea, con posible manchado inicial.';case'combinedCyclicOral':return'Estradiol oral diario + gestágeno 12–14 días/mes (p. ej., progesterona micronizada 200 mg VO nocturna o didrogesterona 10 mg); sangrado programado esperable.';case'combinedContinuousOral':return'Estradiol oral + gestágeno diario en pauta continua (p. ej., estradiol 1 mg + drospirenona 2 mg); objetivo de amenorrea, con posible manchado inicial.';case'tibolone':return'Tibolona 2,5 mg VO diaria (≥12 meses de amenorrea); no asociar gestágeno.';case'tsec':return'Estrógenos conjugados 0,45 mg + bazedoxifeno 20 mg VO diaria (≥12 meses de amenorrea); no asociar gestágeno.';case'neurokinin':return'Fezolinetant 45 mg VO diaria; analítica hepática basal y control según ficha técnica en los primeros meses; no iniciar si ALT/AST o bilirrubina ≥2×LSN.';case'nonHormonal':return state.eligibility?.nh?.tamox?'Venlafaxina, citalopram/escitalopram o gabapentina (evitar paroxetina/fluoxetina con tamoxifeno), individualizando según comorbilidades e interacciones.':'Alternativa no hormonal individualizada: ISRS/IRSN (p. ej., venlafaxina, escitalopram, paroxetina 7,5 mg) o gabapentina según síntomas, comorbilidades e interacciones.';default:return'Individualizar pauta según ficha técnica y perfil clínico.'}}

/* ---------- Navegación y utilidades ---------- */
const PROGRESS_MAP={'station-context':'progress-context','station-cervantes':'progress-cervantes','station-route':'progress-route','station-eligibility':'progress-eligibility','station-treatment':'progress-treatment','station-report':'progress-report'};
function unlockStation(id){$(id).classList.remove('locked');qsa(`.nav-item[data-target="${id}"]`).forEach(b=>b.classList.remove('locked'));$(PROGRESS_MAP[id])?.classList.add('done')}
function goTo(id){qsa('.station').forEach(s=>s.classList.toggle('active',s.id===id));qsa('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.target===id));qsa('.progress-step').forEach(p=>p.classList.remove('active'));$(PROGRESS_MAP[id])?.classList.add('active');window.scrollTo({top:0,behavior:'smooth'})}
function updateSummary(){$('sum-context').textContent=state.age?`${state.age} años · ${amenorrheaLabel(state.amenorrhea)}`:'Pendiente';$('sum-ms').textContent=state.cervantes?`${state.cervantes.ms}/100 (directa ${state.cervantes.msRaw}/45)`:'Pendiente';$('sum-impact').textContent=state.cervantes?(state.cervantes.pharmacologic?'Moderado-severo':'Leve'):'Pendiente';$('sum-route').textContent=state.route==='contraception'?'Anticoncepción':state.route==='thm'?'THM':state.route==='natural'?'No farmacológica':'Pendiente';$('sum-eligibility').textContent=state.eligibility?eligibilityLabel():(state.route==='natural'?'No aplicable':'Pendiente');$('sum-treatment').textContent=state.treatment?treatmentLibrary[state.treatment].title:'Pendiente';$('safety-note').textContent=state.eligibility?.lateAuto?lateCategory3Text():(state.continueLate?lateSafetyText():'La herramienta no sustituye el juicio clínico ni la revisión de ficha técnica.')}
function flash(el,msg){el.className='conclusion red';el.textContent=msg}
async function copyText(id,btn){const el=$(id);el.select();el.setSelectionRange(0,99999);try{await navigator.clipboard.writeText(el.value)}catch(e){document.execCommand('copy')}if(btn){const old=btn.textContent;btn.textContent='Copiado ✓';setTimeout(()=>btn.textContent=old,1500)}}
init();
