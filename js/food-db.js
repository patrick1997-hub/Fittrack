// Eingebaute Datenbank für Grundnahrungsmittel – funktioniert offline und ohne Online-Suche.
// Durchschnittswerte pro 100 g (bzw. 100 ml), gerundet. Reicht für den Alltag; Markenprodukte per Barcode.
// [Name, kcal, Eiweiß, Kohlenhydrate, Fett, Portion in g, Portionsbezeichnung, Suchbegriffe]
const RAW = [
  // Getreide, Brot, Beilagen
  ['Haferflocken', 370, 13.5, 59, 7, 50, '1 Portion', 'hafer oats porridge'],
  ['Porridge mit Milch (fertig)', 110, 4.5, 15, 3.5, 300, '1 Schüssel', 'haferbrei'],
  ['Müsli, ungesüßt', 360, 10, 62, 6, 60, '1 Portion', 'muesli'],
  ['Knuspermüsli / Granola', 450, 9, 64, 17, 50, '1 Portion', 'crunchy granola'],
  ['Cornflakes', 375, 7.5, 84, 0.9, 30, '1 Portion', ''],
  ['Reis, gekocht', 130, 2.7, 28, 0.3, 150, '1 Portion', 'reis'],
  ['Reis, roh', 350, 7, 78, 0.6, 75, '1 Portion', ''],
  ['Basmatireis, gekocht', 121, 3.5, 25, 0.4, 150, '1 Portion', 'reis'],
  ['Nudeln, gekocht', 150, 5.5, 30, 0.9, 200, '1 Portion', 'pasta spaghetti penne teigwaren'],
  ['Nudeln, roh', 355, 12.5, 71, 1.5, 100, '1 Portion', 'pasta spaghetti'],
  ['Vollkornnudeln, gekocht', 140, 5.5, 27, 1.5, 200, '1 Portion', 'pasta'],
  ['Kartoffeln, gekocht', 72, 2, 15, 0.1, 200, '1 Portion', 'erdäpfel salzkartoffeln'],
  ['Bratkartoffeln', 150, 2.5, 20, 6.5, 200, '1 Portion', 'erdäpfel'],
  ['Kartoffelpüree', 95, 2, 13, 4, 200, '1 Portion', 'erdäpfelpüree'],
  ['Pommes frites', 290, 3.4, 36, 15, 150, '1 Portion', 'fritten'],
  ['Süßkartoffel, gekocht', 86, 1.6, 20, 0.1, 200, '1 Portion', ''],
  ['Couscous, gekocht', 112, 3.8, 23, 0.2, 150, '1 Portion', ''],
  ['Quinoa, gekocht', 120, 4.4, 21, 1.9, 150, '1 Portion', ''],
  ['Bulgur, gekocht', 83, 3, 19, 0.2, 150, '1 Portion', ''],
  ['Vollkornbrot', 220, 8, 40, 2, 50, '1 Scheibe', 'brot schwarzbrot'],
  ['Roggenmischbrot', 215, 6.5, 43, 1.2, 50, '1 Scheibe', 'brot'],
  ['Toastbrot', 260, 8, 48, 3.5, 30, '1 Scheibe', 'brot weißbrot'],
  ['Vollkorntoast', 250, 9, 43, 4, 30, '1 Scheibe', 'brot'],
  ['Semmel', 270, 9, 55, 1.5, 55, '1 Stück', 'brötchen weckerl'],
  ['Kornspitz', 280, 10, 47, 5, 65, '1 Stück', 'gebäck'],
  ['Laugenbrezel', 270, 8, 55, 1.5, 90, '1 Stück', 'brezel breze'],
  ['Croissant', 410, 8, 45, 21, 60, '1 Stück', 'kipferl'],
  ['Knäckebrot', 340, 10, 66, 1.5, 10, '1 Scheibe', ''],
  ['Reiswaffel', 385, 8, 81, 3, 8, '1 Stück', ''],
  ['Tortilla / Wrap', 300, 8, 50, 7, 60, '1 Stück', 'wrap'],
  ['Mehl (Weizen)', 340, 10, 72, 1, 30, '2 EL', ''],

  // Obst
  ['Apfel', 52, 0.3, 14, 0.2, 150, '1 Stück', 'äpfel'],
  ['Banane', 89, 1.1, 23, 0.3, 120, '1 Stück', ''],
  ['Birne', 57, 0.4, 15, 0.1, 160, '1 Stück', ''],
  ['Orange', 47, 0.9, 12, 0.1, 180, '1 Stück', 'orangen'],
  ['Mandarine', 53, 0.8, 13, 0.3, 70, '1 Stück', 'clementine'],
  ['Kiwi', 61, 1.1, 15, 0.5, 75, '1 Stück', ''],
  ['Erdbeeren', 32, 0.7, 7.7, 0.3, 150, '1 Schale', 'beeren'],
  ['Heidelbeeren', 57, 0.7, 14, 0.3, 125, '1 Schale', 'blaubeeren beeren'],
  ['Himbeeren', 52, 1.2, 12, 0.7, 125, '1 Schale', 'beeren'],
  ['Weintrauben', 69, 0.7, 18, 0.2, 150, '1 Handvoll', 'trauben'],
  ['Ananas', 50, 0.5, 13, 0.1, 150, '1 Portion', ''],
  ['Mango', 60, 0.8, 15, 0.4, 200, '1 Stück', ''],
  ['Wassermelone', 30, 0.6, 7.6, 0.2, 250, '1 Stück', 'melone'],
  ['Pfirsich', 39, 0.9, 10, 0.3, 150, '1 Stück', 'nektarine'],
  ['Avocado', 160, 2, 9, 15, 80, '½ Avocado', ''],
  ['Datteln, getrocknet', 280, 2.5, 75, 0.4, 8, '1 Stück', ''],
  ['Rosinen', 300, 3, 79, 0.5, 30, '1 Handvoll', ''],

  // Gemüse & Hülsenfrüchte
  ['Tomate', 18, 0.9, 3.9, 0.2, 100, '1 Stück', 'paradeiser tomaten'],
  ['Gurke', 15, 0.7, 3.6, 0.1, 200, '½ Gurke', 'gurken'],
  ['Paprika', 31, 1, 6, 0.3, 150, '1 Stück', ''],
  ['Karotte', 41, 0.9, 10, 0.2, 80, '1 Stück', 'möhre karotten'],
  ['Brokkoli', 34, 2.8, 7, 0.4, 200, '1 Portion', 'broccoli'],
  ['Blumenkohl / Karfiol', 25, 1.9, 5, 0.3, 200, '1 Portion', 'karfiol'],
  ['Zucchini', 17, 1.2, 3.1, 0.3, 200, '1 Portion', ''],
  ['Spinat', 23, 2.9, 3.6, 0.4, 100, '1 Portion', ''],
  ['Blattsalat', 15, 1.2, 2.5, 0.2, 80, '1 Portion', 'salat eisberg häuptel'],
  ['Zwiebel', 40, 1.1, 9, 0.1, 80, '1 Stück', ''],
  ['Champignons', 22, 3.1, 3.3, 0.3, 100, '1 Portion', 'pilze schwammerl'],
  ['Mais (Dose)', 85, 2.9, 15, 1.2, 100, '1 Portion', 'kukuruz'],
  ['Erbsen', 81, 5.4, 14, 0.4, 100, '1 Portion', ''],
  ['Kidneybohnen (Dose)', 105, 7, 15, 0.5, 125, '½ Dose', 'bohnen'],
  ['Kichererbsen (Dose)', 120, 7, 16, 2.6, 125, '½ Dose', ''],
  ['Linsen, gekocht', 116, 9, 20, 0.4, 150, '1 Portion', ''],
  ['Fisolen / grüne Bohnen', 31, 1.8, 7, 0.2, 150, '1 Portion', 'bohnen'],
  ['Spargel', 20, 2.2, 3.9, 0.1, 200, '1 Portion', ''],

  // Milchprodukte & Alternativen
  ['Milch 3,5 %', 64, 3.3, 4.8, 3.5, 250, '1 Glas', 'vollmilch'],
  ['Milch 1,5 %', 47, 3.4, 4.9, 1.5, 250, '1 Glas', 'fettarme milch'],
  ['Haferdrink', 45, 0.5, 6.5, 1.5, 250, '1 Glas', 'hafermilch'],
  ['Sojadrink', 39, 3.3, 2.5, 1.8, 250, '1 Glas', 'sojamilch'],
  ['Joghurt natur 3,5 %', 61, 3.5, 4.7, 3.5, 150, '1 Becher', 'jogurt'],
  ['Griechischer Joghurt 10 %', 130, 5, 4, 10, 150, '1 Portion', 'jogurt'],
  ['Skyr', 63, 11, 4, 0.2, 150, '1 Portion', ''],
  ['Magerquark', 67, 12, 4, 0.3, 250, '1 Becher', 'topfen mager'],
  ['Topfen / Quark 20 %', 110, 12, 3.5, 5, 250, '1 Becher', 'quark'],
  ['Hüttenkäse', 98, 12, 2.6, 4.3, 200, '1 Becher', 'cottage cheese'],
  ['Gouda', 356, 25, 0, 28, 25, '1 Scheibe', 'käse'],
  ['Emmentaler', 380, 28, 0, 30, 25, '1 Scheibe', 'käse'],
  ['Mozzarella', 250, 18, 1, 19, 125, '1 Kugel', 'käse'],
  ['Feta', 265, 14, 4, 21, 50, '1 Portion', 'schafkäse käse'],
  ['Parmesan', 400, 35, 0, 28, 10, '1 EL', 'käse'],
  ['Frischkäse', 250, 6, 3.5, 24, 30, '1 Portion', ''],
  ['Butter', 740, 0.7, 0.6, 82, 10, '1 Portion', ''],
  ['Schlagobers / Sahne', 300, 2.4, 3, 31, 30, '2 EL', 'sahne obers'],

  // Eier, Fleisch, Fisch, Tofu
  ['Ei, gekocht', 155, 13, 1.1, 11, 60, '1 Ei (M)', 'eier'],
  ['Spiegelei', 195, 13.5, 0.8, 15, 60, '1 Ei', 'eier'],
  ['Rührei', 150, 10, 1.5, 11, 120, '2 Eier', 'eier'],
  ['Eiklar', 52, 11, 0.7, 0.2, 33, '1 Ei', 'eiweiß eier'],
  ['Hühnerbrust, gebraten', 165, 31, 0, 3.6, 150, '1 Stück', 'hähnchen huhn chicken'],
  ['Hühnerbrust, roh', 110, 23, 0, 1.5, 150, '1 Stück', 'hähnchen huhn chicken'],
  ['Putenbrust', 110, 24, 0, 1, 150, '1 Stück', 'pute truthahn'],
  ['Rindfleisch, faschiert (roh)', 250, 18, 0, 20, 125, '1 Portion', 'hackfleisch faschiertes'],
  ['Rindersteak', 190, 28, 0, 8, 200, '1 Stück', 'steak rind'],
  ['Schweinefleisch, mager', 140, 22, 0, 6, 150, '1 Portion', 'schwein'],
  ['Schnitzel, paniert (Schwein)', 230, 16, 13, 13, 180, '1 Stück', 'wiener schnitzel'],
  ['Kochschinken', 110, 19, 1, 3.5, 20, '1 Scheibe', 'schinken'],
  ['Salami', 380, 22, 1, 32, 10, '1 Scheibe', 'wurst'],
  ['Speck', 400, 13, 0, 39, 20, '1 Portion', 'bacon'],
  ['Leberkäse', 280, 12, 2, 25, 100, '1 Scheibe', 'leberkäs fleischkäse'],
  ['Würstel / Frankfurter', 270, 13, 1, 24, 50, '1 Stück', 'wurst würstchen'],
  ['Lachs', 200, 20, 0, 13, 125, '1 Filet', 'fisch'],
  ['Thunfisch (Dose, natur)', 110, 25, 0, 1, 130, '1 Dose', 'fisch tuna'],
  ['Garnelen', 85, 18, 0.9, 0.9, 100, '1 Portion', 'shrimps'],
  ['Tofu natur', 140, 15, 2, 8, 100, '1 Portion', ''],

  // Nüsse, Samen, Fette
  ['Mandeln', 600, 21, 9, 52, 30, '1 Handvoll', 'nüsse'],
  ['Walnüsse', 670, 15, 7, 65, 30, '1 Handvoll', 'nüsse'],
  ['Cashewkerne', 580, 18, 30, 44, 30, '1 Handvoll', 'nüsse cashew'],
  ['Erdnüsse', 600, 25, 12, 49, 30, '1 Handvoll', 'nüsse'],
  ['Haselnüsse', 650, 15, 10, 61, 30, '1 Handvoll', 'nüsse'],
  ['Nussmischung', 620, 18, 15, 53, 30, '1 Handvoll', 'nüsse nussmix studentenfutter'],
  ['Erdnussbutter', 610, 25, 14, 50, 20, '1 EL', 'peanut butter erdnussmus'],
  ['Chiasamen', 490, 17, 8, 31, 15, '1 EL', 'chia'],
  ['Leinsamen', 530, 18, 2, 42, 10, '1 EL', ''],
  ['Olivenöl', 880, 0, 0, 100, 10, '1 EL', 'öl'],
  ['Rapsöl', 880, 0, 0, 100, 10, '1 EL', 'öl'],
  ['Margarine', 700, 0.2, 0.4, 78, 10, '1 Portion', ''],
  ['Mayonnaise', 680, 1, 3, 75, 15, '1 EL', 'mayo'],

  // Süßes & Snacks
  ['Honig', 310, 0.4, 80, 0, 20, '1 EL', ''],
  ['Marmelade', 250, 0.3, 60, 0.1, 20, '1 EL', 'konfitüre'],
  ['Nuss-Nougat-Creme', 540, 6, 57, 31, 15, '1 EL', 'nutella'],
  ['Zucker', 400, 0, 100, 0, 5, '1 TL', ''],
  ['Milchschokolade', 540, 7, 57, 31, 20, '2 Rippen', 'schokolade'],
  ['Zartbitterschokolade 70 %', 580, 9, 34, 43, 20, '2 Rippen', 'schokolade'],
  ['Gummibärchen', 340, 7, 77, 0.1, 30, '1 Handvoll', 'fruchtgummi'],
  ['Butterkekse', 450, 7, 73, 14, 25, '3 Stück', 'kekse'],
  ['Kartoffelchips', 540, 6, 50, 34, 30, '1 Handvoll', 'chips'],
  ['Eis (Milcheis)', 200, 3.5, 24, 10, 100, '2 Kugeln', 'eiscreme'],
  ['Rührkuchen', 400, 6, 50, 19, 80, '1 Stück', 'kuchen gugelhupf'],
  ['Apfelstrudel', 230, 3, 32, 10, 150, '1 Stück', 'strudel'],
  ['Müsliriegel', 420, 6, 65, 14, 25, '1 Riegel', 'riegel'],
  ['Proteinriegel', 350, 33, 30, 11, 55, '1 Riegel', 'eiweißriegel riegel'],

  // Getränke (pro 100 ml)
  ['Orangensaft', 45, 0.7, 10, 0.2, 250, '1 Glas', 'saft'],
  ['Apfelsaft', 46, 0.1, 11, 0.1, 250, '1 Glas', 'saft'],
  ['Cola', 42, 0, 10.6, 0, 330, '1 Dose', 'limo'],
  ['Cola Zero', 0.3, 0, 0, 0, 330, '1 Dose', 'light'],
  ['Bier', 43, 0.5, 3.6, 0, 500, '1 Krügerl (0,5 l)', ''],
  ['Wein, rot', 85, 0.1, 2.6, 0, 125, '1 Achtel', 'rotwein'],
  ['Wein, weiß', 80, 0.1, 2.6, 0, 125, '1 Achtel', 'weißwein spritzer'],
  ['Kaffee, schwarz', 2, 0.1, 0.3, 0, 200, '1 Tasse', 'espresso'],
  ['Cappuccino', 38, 2, 3, 1.9, 200, '1 Tasse', 'kaffee'],
  ['Latte Macchiato', 50, 2.5, 3.8, 2.7, 300, '1 Glas', 'kaffee'],
  ['Whey-Protein (Pulver)', 380, 78, 6, 5, 30, '1 Messlöffel', 'eiweißpulver proteinshake shake'],

  // Gerichte
  ['Spaghetti Bolognese', 150, 7, 18, 5, 400, '1 Teller', 'nudeln'],
  ['Gulasch', 140, 13, 4, 8, 300, '1 Portion', 'rindsgulasch'],
  ['Käsespätzle', 230, 9, 24, 11, 350, '1 Portion', 'kasnocken'],
  ['Kaiserschmarrn', 230, 6, 30, 9, 300, '1 Portion', ''],
  ['Lasagne', 160, 8, 14, 8, 350, '1 Portion', ''],
  ['Chili con Carne', 110, 8, 9, 4, 350, '1 Portion', ''],
  ['Pizza Margherita', 250, 11, 30, 9, 350, '1 Pizza (halb)', 'pizza'],
  ['Döner Kebab', 230, 12, 22, 10, 350, '1 Stück', 'kebap'],
  ['Burger', 250, 13, 24, 11, 220, '1 Stück', 'hamburger cheeseburger'],
  ['Sushi (Maki)', 150, 4, 30, 1.5, 150, '6 Stück', ''],
  ['Griechischer Salat', 110, 4, 4, 9, 300, '1 Portion', 'salat'],
];

export const GENERIC_FOODS = RAW.map(([name, kcal, protein, carbs, fat, serving, servingLabel, tags]) => ({
  id: `gen:${name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-')}`,
  name,
  brand: '',
  per100: { kcal, protein, carbs, fat },
  serving,
  servingLabel: `${servingLabel} ≈ ${serving} g`,
  tags,
  source: 'generic',
}));

// Für die Suche: Groß/klein und Umlaute egal ("apfel" findet "Äpfel").
export function normalize(text) {
  return String(text || '').toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function searchGeneric(term, limit = 15) {
  const t = normalize(term).trim();
  if (!t) return [];
  const scored = [];
  for (const f of GENERIC_FOODS) {
    const name = normalize(f.name);
    const tags = normalize(f.tags);
    let score = 0;
    if (name === t) score = 100;
    else if (name.startsWith(t)) score = 80;
    else if (name.split(/[\s,/()-]+/).some((w) => w.startsWith(t))) score = 60;
    else if (name.includes(t)) score = 40;
    else if (tags.split(' ').some((w) => w.startsWith(t))) score = 30;
    if (score) scored.push([score, f]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].name.length - b[1].name.length).slice(0, limit).map((x) => x[1]);
}
