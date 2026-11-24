// 账号管理的命令行版（万一网页后台进不去时救急用）
// 用法（在项目目录里跑）：
//   node scripts/admin.mjs list
//   node scripts/admin.mjs create-admin 账号 密码 [姓名]
//   node scripts/admin.mjs create 账号 密码 [姓名] [到期日 2027-01-31]
//   node scripts/admin.mjs password 账号 新密码
//   node scripts/admin.mjs disable 账号
//   node scripts/admin.mjs enable 账号
//   node scripts/admin.mjs delete 账号
import {
  listUsers, findByUsername, createUser, updateUser, deleteUser, publicUser, userState,
} from '../lib/accounts.js';

const [, , cmd, ...args] = process.argv;
const die = (msg) => { console.error(msg); process.exit(1); };

function show(u) {
  const st = userState(u);
  const keys = u.keys?.deepseek ? '已填密钥' : '没填密钥';
  console.log(`${u.role === 'admin' ? '[管理员] ' : ''}${u.username}${u.name ? `（${u.name}）` : ''}  ${st.ok ? '正常' : st.error}  ${keys}${u.expiresAt ? `  到期 ${u.expiresAt}` : ''}`);
}

async function main() {
  if (!cmd || cmd === 'help' || cmd === '-h') {
    console.log(`出片王账号管理
  list                              列出所有账号
  create-admin <账号> <密码> [姓名]  建管理员
  create <账号> <密码> [姓名] [到期日] 建客户账号
  password <账号> <新密码>           重置密码
  disable <账号> / enable <账号>     停用 / 启用
  delete <账号>                     删除账号（数据挪到 _已删除账号/）
`);
    return;
  }
  if (cmd === 'list') {
    const users = await listUsers();
    if (!users.length) return console.log('还没有账号');
    for (const u of users) show(u);
    return;
  }
  const [username, password, name, expiresAt] = args;
  if (!username) die('少了账号');
  if (cmd === 'create-admin' || cmd === 'create') {
    if (!password) die('少了密码');
    const u = await createUser({ username, password, name: name || '', role: cmd === 'create-admin' ? 'admin' : 'user', expiresAt: expiresAt || '' });
    console.log(`已创建：${u.username}${u.role === 'admin' ? '（管理员）' : ''}`);
    return;
  }
  const u = await findByUsername(username);
  if (!u) die(`没有这个账号：${username}`);
  if (cmd === 'password') {
    if (!password) die('少了新密码');
    await updateUser(u.id, { password });
    console.log(`已改密码：${u.username}（他那边会自动退出）`);
  } else if (cmd === 'disable') {
    await updateUser(u.id, { active: false });
    console.log(`已停用：${u.username}`);
  } else if (cmd === 'enable') {
    await updateUser(u.id, { active: true });
    console.log(`已启用：${u.username}`);
  } else if (cmd === 'delete') {
    await deleteUser(u.id);
    console.log(`已删除：${u.username}（数据在 data/users/_已删除账号/）`);
  } else {
    die(`不认识的命令：${cmd}`);
  }
}

main().catch((e) => die(e.message));
