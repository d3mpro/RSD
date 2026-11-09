const assert = require('assert');
const fs = require('fs');

console.log('🧪 Verifying FACP standard asset design and normal building selection...');

// 1. Check ksu-official-card.js does not contain the big registry card in updateSpecializedFormFields
const cardJs = fs.readFileSync('assets/js/ksu-official-card.js', 'utf8');
assert(!cardJs.includes('<span>سجل لوحات إنذار الحريق المعتمدة</span>'), 'Specialized container must not contain giant registry card');
assert(!cardJs.includes('id="facp-panels-grid"'), 'Specialized container must not contain duplicate panels grid');
assert(!cardJs.includes('id="inp-facp-search"'), 'Specialized container must not contain duplicate search input');
console.log('✔ ksu-official-card.js verified: giant card removed from updateSpecializedFormFields');

// 2. Check app.js does not contain facpFilterPanelHtml or all-buildings override for fas_insp
const appJs = fs.readFileSync('assets/js/app.js', 'utf8');
assert(!appJs.includes('facpFilterPanelHtml'), 'app.js must not contain facpFilterPanelHtml in reconciliation');
assert(!appJs.includes('<option value="all">🚨 جميع مباني المدينة الطبية'), 'buildingSelect must not force all-buildings option for fas_insp');
console.log('✔ app.js verified: normal building select and no duplicate filter pills');

// 3. Simple Mock DOM
function createElement(tag) {
  const el = {
    tagName: tag.toUpperCase(),
    options: [],
    value: '',
    innerHTML: '',
    textContent: '',
    children: [],
    classList: {
      classes: new Set(),
      add: (c) => el.classList.classes.add(c),
      remove: (c) => el.classList.classes.delete(c),
      contains: (c) => el.classList.classes.has(c)
    }
  };
  Object.defineProperty(el, 'innerHTML', {
    set(html) {
      this._html = html;
      this.textContent = html.replace(/<[^>]*>/g, ' ');
      // Parse <option value="..."> tags
      const matches = [...html.matchAll(/<option\s+value="([^"]*)"[^>]*>/g)];
      this.options = matches.map(m => ({ value: m[1] }));
      if (this.options.length > 0 && !this.value) {
        this.value = this.options[0].value;
      }
    },
    get() {
      return this._html || '';
    }
  });
  return el;
}

const elements = {
  'inp-round-form-type': createElement('select'),
  'inp-round-building': createElement('select'),
  'inp-round-floor': createElement('select'),
  'round-specialized-fields-container': createElement('div'),
  'round-floor-assets-reconciliation-widget': createElement('div'),
  'round-location-verification-text': createElement('span')
};

global.window = { state: { currentRoundDraft: {} }, addEventListener: () => {} };
global.document = {
  getElementById: (id) => elements[id] || null,
  addEventListener: () => {}
};
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

// Load ksu-facp-assets and app.js
global.KSU_FACP_ASSETS = require('../assets/js/ksu-facp-assets.js').KSU_FACP_ASSETS;
const scriptContext = `
${appJs}
global.state = state;
global.populateDynamicDropdowns = populateDynamicDropdowns;
global.populateRoundFloorOptions = populateRoundFloorOptions;
global.renderFloorAssetsReconciliation = renderFloorAssetsReconciliation;
`;
eval(scriptContext);

// Test building dropdown
state.currentRoundDraft = { formType: 'fas_insp', building: 'المستشفى', floor: 'الدور الأرضي (G)' };
populateDynamicDropdowns();

const bldSelect = elements['inp-round-building'];
const options = bldSelect.options.map(o => o.value);
assert(!options.includes('all'), 'Building options must not contain "all"');
assert(options.includes('المستشفى'), 'Building options must include المستشفى');
assert(options.includes('كلية الطب'), 'Building options must include كلية الطب');
assert(options.includes('المبنى الإداري'), 'Building options must include المبنى الإداري');
assert(options.includes('العناية المركزة'), 'Building options must include العناية المركزة');
assert(options.includes('المستودعات الخارجية'), 'Building options must include المستودعات الخارجية');
console.log('✔ Building options verified: standard selectable list of all KSU buildings');

// Test Medicine College floor mapping
populateRoundFloorOptions('كلية الطب');
const floorSelect = elements['inp-round-floor'];
const flOptions = floorSelect.options.map(o => o.value);
assert(!flOptions.includes('all'), 'Floor options must not contain "all"');
assert(flOptions.includes('القبو الأول (B1)'), 'Medicine college floors must include B1');
console.log('✔ Floor options verified: Medicine College includes B1');

// Test reconciliation for Medicine College B1
bldSelect.value = 'كلية الطب';
floorSelect.value = 'القبو الأول (B1)';
state.currentRoundDraft.building = 'كلية الطب';
state.currentRoundDraft.floor = 'القبو الأول (B1)';
renderFloorAssetsReconciliation();

const widget = elements['round-floor-assets-reconciliation-widget'];
const widgetText = widget.textContent;
assert(widgetText.includes('FA0074'), 'Widget must list FA0074 on Medicine College B1');
assert(widgetText.includes('FA0095'), 'Widget must list FA0095 on Medicine College B1');
assert(widgetText.includes('سليم'), 'Widget must have standard سليم button');
assert(widgetText.includes('ملاحظة'), 'Widget must have standard ملاحظة button');
console.log('✔ Reconciliation verified: FA0074 and FA0095 appear with standard verification buttons');

console.log('🎉 ALL VERIFICATIONS PASSED 100%!');
