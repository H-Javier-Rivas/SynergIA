import Database from 'better-sqlite3';
const db = new Database('memory_tutor.db');
const user = db.prepare('SELECT id, plan, status FROM users WHERE telegram_id = 1807055922').get();
if (user) {
    const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? AND status = "pending"').get(user.id);
    console.log(`User: ${JSON.stringify(user)}, Pending Sub: ${JSON.stringify(sub)}`);
} else {
    console.log("User not found");
}
db.close();
