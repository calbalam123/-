const citizens = new Map();
const treasury = { balance: 10000000 };

function citizen(id, nickname) {
  if (!citizens.has(id)) {
    citizens.set(id, {
      id, nickname, money: 10000, title: "시민", joinedAt: new Date().toISOString()
    });
  }
  const c = citizens.get(id);
  c.nickname = nickname || c.nickname;
  return c;
}

export function handleCommand({ id, nickname, message }) {
  const c = citizen(id, nickname);
  const args = message.split(/\\s+/);
  const command = args[0].toLowerCase();

  if (command === ">가입") {
    return { text: `🐹 ${c.nickname}님, 햄찌국 시민으로 등록되었습니다!\n💰 시작금: 10,000원\n🏅 칭호: 시민` };
  }

  if (command === ">내정보") {
    return { text: `[ 🐹 시민 정보 ]\n닉네임: ${c.nickname}\n칭호: ${c.title}\n잔액: ${c.money.toLocaleString()}원` };
  }

  if (command === ">돈" || command === ">계좌") {
    return { text: `💰 ${c.nickname}님의 잔액: ${c.money.toLocaleString()}원` };
  }

  if (command === ">국가정보" || command === ">국가") {
    return { text: `[ 🐹 햄찌국 ]\n👥 시민: ${citizens.size}명\n💰 국고: ${treasury.balance.toLocaleString()}원\n🏛️ 수도: 햄찌시티\n📜 체제: 가상국가` };
  }

  if (command === ">세금") {
    const tax = Math.min(c.money, 1000);
    c.money -= tax;
    treasury.balance += tax;
    return { text: `🧾 세금 ${tax.toLocaleString()}원을 납부했습니다.\n💰 잔액: ${c.money.toLocaleString()}원` };
  }

  if (command === ">도움말") {
    return { text: `[ 🐹 햄찌 가상국가 ]\n\n>가입\n>내정보\n>돈\n>국가정보\n>세금\n>뉴스\n>도움말\n\n※ 경제·선거·부동산·기업 시스템은 모듈로 확장할 수 있습니다.` };
  }

  if (command === ">뉴스") {
    return { text: "📰 햄찌국 뉴스\n오늘도 햄찌국은 평화롭습니다. 🐹" };
  }

  return { text: `❓ 알 수 없는 명령어입니다. >도움말 을 입력하세요.` };
}