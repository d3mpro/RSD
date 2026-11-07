const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createNavSandbox(pathname = '/quality.html', activeUser = null) {
  const store = new Map();
  if (activeUser) {
    store.set('ksu_active_user', JSON.stringify(activeUser));
  }

  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };

  const elementsById = new Map();
  const appendedScripts = [];

  const makeEl = (tag = 'div') => {
    let _innerHTML = '';
    const el = {
      tagName: String(tag).toUpperCase(),
      id: '',
      className: '',
      style: {},
      children: [],
      get innerHTML() { return _innerHTML; },
      set innerHTML(val) {
        _innerHTML = String(val);
        // Index key IDs rendered inside header HTML
        const idMatches = _innerHTML.matchAll(/id="([^"]+)"/g);
        for (const m of idMatches) {
          if (!elementsById.has(m[1])) {
            elementsById.set(m[1], makeEl('div'));
          }
        }
      },
      classList: {
        _s: new Set(),
        add(...c) { c.forEach(x => this._s.add(x)); },
        remove(...c) { c.forEach(x => this._s.delete(x)); },
        contains(c) { return this._s.has(c); }
      },
      prepend(child) {
        this.children.unshift(child);
        if (child && child.id) elementsById.set(child.id, child);
      },
      appendChild(child) {
        this.children.push(child);
        if (child && child.tagName === 'SCRIPT') appendedScripts.push(child);
        if (child && child.id) elementsById.set(child.id, child);
        return child;
      },
      insertAdjacentHTML() {}
    };
    return el;
  };

  const document = {
    head: makeEl('head'),
    body: makeEl('body'),
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => elementsById.get(id) || null,
    addEventListener: () => {}
  };

  const sandbox = {
    console,
    localStorage,
    document,
    location: { pathname, replace: () => {} },
    confirm: () => true,
    alert: () => {},
    _appendedScripts: appendedScripts
  };
  sandbox.window = sandbox;
  return vm.createContext(sandbox);
}

const repoRoot = path.resolve(__dirname, '..');
const navCode = fs.readFileSync(path.join(repoRoot, 'assets/js/ksu-nav-component.js'), 'utf-8');

test('Task 4.1: Field inspector and field.html portal NEVER render #ksu-nav-cloud-archive-btn', () => {
  // Case A: field_inspector on dashboard
  const ctxInspector = createNavSandbox('/dashboard.html', {
    name: 'مفتش ميداني',
    empId: '20401',
    roleCategory: 'field_inspector'
  });
  vm.runInContext(navCode, ctxInspector);
  ctxInspector.window.KSUNav.init({ activePortal: 'dashboard' });
  const headerInspector = ctxInspector.document.getElementById('ksu-global-header');
  assert.equal(headerInspector.innerHTML.includes('ksu-nav-cloud-archive-btn'), false, 'field_inspector must NEVER see cloud archive button');

  // Case B: admin user viewing field.html
  const ctxFieldPortal = createNavSandbox('/field.html', {
    name: 'أ. علي سليمان الصقري',
    empId: '95972',
    roleCategory: 'developer'
  });
  vm.runInContext(navCode, ctxFieldPortal);
  ctxFieldPortal.window.KSUNav.init({ activePortal: 'field' });
  const headerField = ctxFieldPortal.document.getElementById('ksu-global-header');
  assert.equal(headerField.innerHTML.includes('ksu-nav-cloud-archive-btn'), false, 'field.html portal must NEVER show cloud archive button');

  // Case C: unauthenticated guest
  const ctxGuest = createNavSandbox('/quality.html', null);
  vm.runInContext(navCode, ctxGuest);
  ctxGuest.window.KSUNav.init({ activePortal: 'quality' });
  const headerGuest = ctxGuest.document.getElementById('ksu-global-header');
  assert.equal(headerGuest.innerHTML.includes('ksu-nav-cloud-archive-btn'), false, 'guest must NEVER see cloud archive button');
});

test('Task 4.2: Authorized roles (head, admin, quality, supervisor, developer) render #ksu-nav-cloud-archive-btn and openCloudArchiveHub invokes or lazy-loads ksuSyncEngine', () => {
  for (const roleCategory of ['head', 'admin', 'quality', 'supervisor', 'developer']) {
    const ctx = createNavSandbox('/head.html', {
      name: 'مشرف معتمد',
      empId: '10500',
      roleCategory
    });
    vm.runInContext(navCode, ctx);
    ctx.window.KSUNav.init({ activePortal: roleCategory === 'quality' ? 'quality' : 'head' });

    const header = ctx.document.getElementById('ksu-global-header');
    assert.equal(
      header.innerHTML.includes('id="ksu-nav-cloud-archive-btn"'),
      true,
      `Role ${roleCategory} must see #ksu-nav-cloud-archive-btn`
    );
  }

  // Test openCloudArchiveHub when ksuSyncEngine is already loaded
  const ctxLoaded = createNavSandbox('/head.html', { name: 'رئيس القسم', roleCategory: 'head' });
  let modalOpened = 0;
  ctxLoaded.window.ksuSyncEngine = { openSyncModal: () => { modalOpened++; } };
  vm.runInContext(navCode, ctxLoaded);
  assert.equal(typeof ctxLoaded.window.KSUNav.openCloudArchiveHub, 'function');
  ctxLoaded.window.KSUNav.openCloudArchiveHub();
  assert.equal(modalOpened, 1);

  // Test openCloudArchiveHub lazy-loader when ksuSyncEngine is not yet loaded on page
  const ctxLazy = createNavSandbox('/dashboard.html', { name: 'مشرف', roleCategory: 'admin' });
  vm.runInContext(navCode, ctxLazy);
  ctxLazy.window.KSUNav.openCloudArchiveHub();
  assert.equal(ctxLazy._appendedScripts.length, 1);
  assert.match(ctxLazy._appendedScripts[0].src, /ksu-cloud-sync\.js/);
});
