// PineBot unified virtual-country economy engine.
const money = (n, currency) => Number(n).toLocaleString('ko-KR') + ' ' + currency;
const get = (db, sql, ...args) => db.prepare(sql).get(...args);
const all = (db, sql, ...args) => db.prepare(sql).all(...args);
const run = (db, sql, ...args) => db.prepare(sql).run(...args);

export function initializeCountryEconomy(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS countries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      currency_name TEXT NOT NULL,
      currency_code TEXT NOT NULL,
      treasury INTEGER NOT NULL DEFAULT 0,
      tax_rate REAL NOT NULL DEFAULT 0,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMPSTAMP
    );
    CREATE TABLE IF NOT EXISTS country_members (
      country_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(country_id, user_id),
      FOREIGN KEY(country_id) REFERENCES countries(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS country_wallets (
      country_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      cash INTEGER NOT NULL DEFAULT 100000,
      bank INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(country_id, user_id),
      FOREIGN KEY(country_id) REFERENCES countries(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS country_rooms (
      room_id TEXT PRIMARY KEY,
      country_id INTEGER NOT NULL,
      linked_by INTEGER NOT NULL,
      linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(country_id) REFERENCES countries(id)
    );
    CREATE TABLE IF NOT EXISTS country_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country_id INTEGER NOT NULL,
      from_user_id INTEGER,
      to_user_id INTEGER,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL,
      memo TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_country_transactions_country ON country_transactions(country_id, id);
  `);
}

function membership(db, country, userId) {
  return get(db, 'SELECT * FROM country_members WHERE country_id=? AND user_id=?', country.id, userId);
}
function wallet(db, country, userId) {
  return get(db, 'SELECT * FROM country_wallets WHERE country_id=? AND user_id=?', country.id, userId);
}
function ensureWallet(db, country, userId) {
  run(db, 'INSERT OR IGNORE INTO country_wallets(country_id,user_id) VALUES(?,?)', country.id, userId);
  return wallet(db, country, userId);
}
function contextCountry(db, userId, roomId) {
  if (roomId) {
    const linked = get(db, 'SELECT country_id FROM country_rooms WHERE room_id=?', String(roomId));
    if (linked) return get(db, 'SELECT * FROM countries WHERE id=?', linked.country_id);
  }
  return get(db, `SELECT c.* FROM country_members m JOIN countries c ON c.id=m.country_id
    WHERE m.user_id=? ORDER BY m.joined_at DESC LIMIT 1`, userId);
}
function isAdmin(member) { return member && ['owner', 'admin'].includes(member.role); }

export function handleCountryCommand({ db, user, raw, roomId = null }) {
  const input = String(raw || '').trim();
  const [cmd, ...args] = input.split(/\s+/);
  const nameOf = (id) => get(db, 'SELECT nickname FROM users WHERE id=?', id)?.nickname || '알 수 없음';

  if (cmd === '.국가목록') {
    const rows = all(db, 'SELECT code,name,currency_name,currency_code FROM countries ORDER BY id');
    return '🌐 [ 파인봇 가상국가 목록 ]\n' + (rows.length
      ? rows.map(c => c.code + ' | ' + c.name + ' | ' + c.currency_name + ' (' + c.currency_code + ')').join('\n')
      : '등록된 국가가 없습니다.\n.국가등록 국가명 통화명 통화코드');
  }

  if (cmd === '.국가등록') {
    if (args.length < 3) return '사용법: .국가등록 국가명 통화명 통화코드\n예시: .국가등록 대한제국 원 대한제국원';
    const [countryName, currencyName, currencyCodeRaw] = args;
    const currencyCode = currencyCodeRaw.toUpperCase();
    if (!/^[A-Z0-9가-힣]{2,10}$/.test(currencyCode)) return '통화 코드는 2~10자의 한글·영문·숫자만 사용할 수 있습니다.';
    if (get(db, 'SELECT 1 FROM countries WHERE name=? OR currency_code=?', countryName, currencyCode)) return '이미 등록된 국가명 또는 통화 코드입니다.';
    const tx = db.transaction(() => {
      const result = run(db, 'INSERT INTO countries(code,name,currency_name,currency_code,created_by) VALUES(?,?,?,?,?)',
        'P' + String(Date.now()).slice(-7), countryName, currencyName, currencyCode, user.id);
      const country = get(db, 'SELECT * FROM countries WHERE id=?', result.lastInsertRowid);
      run(db, "INSERT INTO country_members(country_id,user_id,role) VALUES(?,?,'owner')", country.id, user.id);
      ensureWallet(db, country, user.id);
      return country;
    });
    const country = tx();
    return '🏛️ 국가 등록 완료!\n국가명: ' + country.name + '\n국가 코드: ' + country.code +
      '\n통화: ' + country.currency_name + ' (' + country.currency_code + ')\n등록자: ' + user.nickname +
      '\n\n방 연결: .방연결 ' + country.code;
  }

  if (cmd === '.국가가입' || cmd === '.국가선택') {
    if (!args[0]) return '사용법: .국가가입 국가코드\n국가 목록은 .국가목록';
    const country = get(db, 'SELECT * FROM countries WHERE code=? OR name=?', args[0].toUpperCase(), args[0]);
    if (!country) return '해당 국가를 찾을 수 없습니다. .국가목록을 확인하세요.';
    const tx = db.transaction(() => {
      run(db, "INSERT OR IGNORE INTO country_members(country_id,user_id,role) VALUES(?,?,'member')", country.id, user.id);
      ensureWallet(db, country, user.id);
    });
    tx();
    return '🤝 ' + country.name + ' 가입 및 선택 완료!\n통화: ' + country.currency_name + ' (' + country.currency_code + ')\n.계좌 로 잔액을 확인하세요.';
  }

  if (cmd === '.방연결') {
    if (!roomId) return '이 명령은 room_id가 전달되는 봇 어댑터에서만 사용할 수 있습니다.';
    if (!args[0]) return '사용법: .방연결 국가코드';
    const country = get(db, 'SELECT * FROM countries WHERE code=?', args[0].toUpperCase());
    if (!country) return '국가 코드를 확인하세요. .국가목록';
    if (!isAdmin(membership(db, country, user.id))) return '해당 국가의 국가 관리자만 방을 연결할 수 있습니다.';
    run(db, 'INSERT INTO country_rooms(room_id,country_id,linked_by) VALUES(?,?,?) ON CONFLICT(room_id) DO UPDATE SET country_id=excluded.country_id,linked_by=excluded.linked_by,linked_at=CURRENT_TIMESTAMP',
      String(roomId), country.id, user.id);
    return '🔗 현재 채팅방을 ' + country.name + '에 연결했습니다.';
  }

  if (cmd === '.방해제') {
    if (!roomId) return '이 명령은 room_id가 전달되는 봇 어댑터에서만 사용할 수 있습니다.';
    const linked = get(db, 'SELECT c.* FROM country_rooms r JOIN countries c ON c.id=r.country_id WHERE r.room_id=?', String(roomId));
    if (!linked) return '현재 채팅방은 국가에 연결되어 있지 않습니다.';
    if (!isAdmin(membership(db, linked, user.id))) return '해당 국가의 국가 관리자만 방 연결을 해제할 수 있습니다.';
    run(db, 'DELETE FROM country_rooms WHERE room_id=?', String(roomId));
    return '🔓 ' + linked.name + '과(와) 현재 채팅방의 연결을 해제했습니다.';
  }

  if (cmd === '.국가정보' || cmd === '.계좌' || cmd === '.국고' || cmd === '.세금설정' || cmd === '.국고지급' || cmd === '.송금' || cmd === '.국가관리자') {
    const country = contextCountry(db, user.id, roomId);
    if (!country) return '먼저 .국가목록에서 국가를 확인하고 .국가가입 국가코드 로 가입하세요.';
    const member = membership(db, country, user.id);
    if (!member) return '이 국가의 구성원이 아닙니다. .국가가입 ' + country.code;
    const w = ensureWallet(db, country, user.id);

    if (cmd === '.국가정보') {
      const count = get(db, 'SELECT COUNT(*) AS n FROM country_members WHERE country_id=?', country.id).n;
      const roomCount = get(db, 'SELECT COUNT(*) AS n FROM country_rooms WHERE country_id=?', country.id).n;
      return '🏛️ [ ' + country.name + ' ]\n국가 코드: ' + country.code + '\n통화: ' + country.currency_name + ' (' + country.currency_code + ')' +
        '\n국고: ' + money(country.treasury, country.currency_code) + '\n세율: ' + country.tax_rate + '%' +
        '\n구성원: ' + count + '명\n연결된 방: ' + roomCount + '개';
    }
    if (cmd === '.계좌') {
      return '💳 [ ' + country.name + ' 계좌 ]\n닉네임: ' + user.nickname + '\n보유 현금: ' +
        money(w.cash, country.currency_code) + '\n예금: ' + money(w.bank, country.currency_code) +
        '\n권한: ' + (member.role === 'owner' ? '국가 설립자' : member.role === 'admin' ? '국가 관리자' : '국민');
    }
    if (cmd === '.국고') {
      return '🏦 [ ' + country.name + ' 국고 ]\n잔액: ' + money(country.treasury, country.currency_code) +
        '\n세율: ' + country.tax_rate + '%';
    }
    if (cmd === '.세금설정') {
      if (!isAdmin(member)) return '국가 관리자만 세율을 변경할 수 있습니다.';
      const rate = Number(args[0]);
      if (!Number.isFinite(rate) || rate < 0 || rate > 50) return '사용법: .세금설정 0~50 (퍼센트)';
      run(db, 'UPDATE countries SET tax_rate=? WHERE id=?', rate, country.id);
      return '📑 ' + country.name + ' 세율을 ' + rate + '%로 설정했습니다.';
    }
    if (cmd === '.국고지급') {
      if (!isAdmin(member)) return '국가 관리자만 국고를 지급할 수 있습니다.';
      if (args.length < 2) return '사용법: .국고지급 @닉네임 금액';
      const targetName = args[0].replace(/^@/, '');
      const target = get(db, 'SELECT * FROM users WHERE nickname=?', targetName);
      const amount = Number(args[1]);
      if (!target || !membership(db, country, target.id)) return '같은 국가의 구성원을 찾을 수 없습니다.';
      if (!Number.isSafeInteger(amount) || amount <= 0 || country.treasury < amount) return '지급 금액 또는 국고 잔액을 확인하세요.';
      const tx = db.transaction(() => {
        run(db, 'UPDATE countries SET treasury=treasury-? WHERE id=?', amount, country.id);
        run(db, 'UPDATE country_wallets SET cash=cash+? WHERE country_id=? AND user_id=?', amount, country.id, target.id);
        run(db, "INSERT INTO country_transactions(country_id,to_user_id,amount,type,memo) VALUES(?,?,?,'treasury_grant','국고 지급')", country.id, target.id, amount);
      });
      tx();
      return '💸 ' + target.nickname + '에게 ' + money(amount, country.currency_code) + ' 지급 완료';
    }
    if (cmd === '.송금') {
      if (args.length < 2) return '사용법: .송금 @닉네임 금액';
      const target = get(db, 'SELECT * FROM users WHERE nickname=?', args[0].replace(/^@/, ''));
      const amount = Number(args[1]);
      if (!target || target.id === user.id || !membership(db, country, target.id)) return '받는 사람은 같은 국가의 다른 구성원이어야 합니다.';
      if (!Number.isSafeInteger(amount) || amount <= 0 || w.cash < amount) return '금액 또는 보유 현금을 확인하세요.';
      const tx = db.transaction(() => {
        run(db, 'UPDATE country_wallets SET cash=cash-? WHERE country_id=? AND user_id=?', amount, country.id, user.id);
        run(db, 'UPDATE country_wallets SET cash=cash+? WHERE country_id=? AND user_id=?', amount, country.id, target.id);
        run(db, "INSERT INTO country_transactions(country_id,from_user_id,to_user_id,amount,type,memo) VALUES(?,?,?,?,'transfer','국민 송금')", country.id, user.id, target.id, amount);
      });
      tx();
      return '💸 송금 완료\n' + user.nickname + ' → ' + target.nickname + '\n금액: ' + money(amount, country.currency_code);
    }
    if (cmd === '.국가관리자') {
      if (member.role !== 'owner') return '국가 설립자만 관리자를 임명할 수 있습니다.';
      if (!args[0]) return '사용법: .국가관리자 @닉네임';
      const target = get(db, 'SELECT * FROM users WHERE nickname=?', args[0].replace(/^@/, ''));
      if (!target || !membership(db, country, target.id)) return '해당 국가에 가입한 구성원을 찾을 수 없습니다.';
      run(db, "UPDATE country_members SET role='admin' WHERE country_id=? AND user_id=?", country.id, target.id);
      return '🛡️ ' + target.nickname + ' 님을 ' + country.name + ' 국가 관리자로 임명했습니다.';
    }
  }

  if (cmd === '.출석') {
    const country = contextCountry(db, user.id, roomId);
    if (!country || !membership(db, country, user.id)) return '먼저 국가에 가입하세요. .국가목록';
    const today = new Date().toISOString().slice(0, 10);
    const last = get(db, 'SELECT created_at FROM country_transactions WHERE country_id=? AND to_user_id=? AND type=? ORDER BY id DESC LIMIT 1',
      country.id, user.id, 'attendance');
    if (last?.created_at?.slice(0, 10) === today) return '오늘은 이미 출석했습니다.';
    const amount = 1000 + Math.floor(Math.random() * 4001);
    const tax = Math.floor(amount * country.tax_rate / 100);
    const tx = db.transaction(() => {
      ensureWallet(db, country, user.id);
      run(db, 'UPDATE country_wallets SET cash=cash+? WHERE country_id=? AND user_id=?', amount - tax, country.id, user.id);
      run(db, 'UPDATE countries SET treasury=treasury+? WHERE id=?', tax, country.id);
      run(db, "INSERT INTO country_transactions(country_id,to_user_id,amount,type,memo) VALUES(?,?,?,'attendance','출석 보상')", country.id, user.id, amount);
    });
    tx();
    return '🎁 출석 완료!\n기본 보상: ' + money(amount, country.currency_code) +
      '\n세금: ' + money(tax, country.currency_code) + '\n실수령: ' + money(amount - tax, country.currency_code);
  }

  if (cmd === '.도움말') {
    return '🌲 [ 파인봇 통합 경제 시스템 ]\n' +
      '.국가목록 | .국가등록 국가명 통화명 통화코드\n' +
      '.국가가입 국가코드 | .국가정보 | .계좌 | .출석\n' +
      '.송금 @닉네임 금액 | .국고\n' +
      '.세금설정 0~50 | .국고지급 @닉네임 금액\n' +
      '.국가관리자 @닉네임\n' +
      '.방연결 국가코드 | .방해제\n' +
      '국가를 먼저 가입하거나 채팅방에 연결해 사용하세요.';
  }

  return null;
}
