const { conn } = require('./config');

module.exports = {
  pick(obj, paths = [], fallback = null) {
    for (const p of paths) {
      const val = p
        .split('.')
        .reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj);
      if (val !== undefined && val !== null) return val;
    }
    return fallback;
  },

  ensureTables: async () => {
    const ddls = [
      `CREATE TABLE IF NOT EXISTS merchant_qris_categories (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        qty INT NOT NULL DEFAULT 1,
        sort_no INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_by BIGINT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS merchant_qris_transactions (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        reference_id VARCHAR(80) NOT NULL UNIQUE,
        payment_channel VARCHAR(20) NOT NULL DEFAULT 'qris',
        amount BIGINT NOT NULL,
        callback_url VARCHAR(255) NULL,
        redirect_url VARCHAR(255) NULL,
        expired_in INT NOT NULL DEFAULT 30,
        status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        customer_name VARCHAR(120) NULL,
        customer_email VARCHAR(120) NULL,
        customer_phone VARCHAR(40) NULL,
        note TEXT NULL,
        qr_string TEXT NULL,
        qr_url TEXT NULL,
        provider_response LONGTEXT NULL,
        paid_at DATETIME NULL,
        expires_at DATETIME NULL,
        created_by BIGINT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS merchant_qris_transaction_items (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        transaction_id BIGINT UNSIGNED NOT NULL,
        product VARCHAR(150) NOT NULL,
        amount BIGINT NOT NULL,
        qty INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_qris_tx_item_tx
          FOREIGN KEY (transaction_id)
          REFERENCES merchant_qris_transactions(id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS merchant_qris_transaction_categories (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        transaction_id BIGINT UNSIGNED NOT NULL,
        category_id BIGINT UNSIGNED NULL,
        category_name VARCHAR(120) NOT NULL,
        qty INT NOT NULL DEFAULT 1,
        sort_no INT NOT NULL DEFAULT 0,
        qty INT NOT NULL DEFAULT 1,
        amount BIGINT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_qris_tx_cat_tx
          FOREIGN KEY (transaction_id)
          REFERENCES merchant_qris_transactions(id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    ];

    for (const ddl of ddls) {
      await new Promise((resolve, reject) => {
        conn.query(ddl, (err) =>
          err ? reject(new Error(err.message || String(err))) : resolve(true),
        );
      });
    }

    // backfill for existing table (idempotent)
    await new Promise((resolve) => {
      conn.query(
        `ALTER TABLE merchant_qris_categories ADD COLUMN qty INT NOT NULL DEFAULT 1 AFTER name`,
        () => resolve(true),
      );
    });

    return true;
  },

  listCategories: () =>
    new Promise((resolve, reject) => {
      conn.query(
        `SELECT id, name, qty, sort_no, is_active, created_at, updated_at
       FROM merchant_qris_categories
       WHERE is_active = 1
       ORDER BY sort_no ASC, id ASC`,
        (e, rows) => (e ? reject(new Error(e.message || String(e))) : resolve(rows || [])),
      );
    }),

  createCategory: ({ name, qty = 0, created_by = null }) =>
    new Promise((resolve, reject) => {
      conn.query(
        `INSERT INTO merchant_qris_categories(name, qty, sort_no, created_by) VALUES (?, ?, 0, ?)`,
        [name, Number(qty || 0), created_by],
        (e, result) => (e ? reject(new Error(e.message || String(e))) : resolve(result.insertId)),
      );
    }),

  createTransaction: (payload) =>
    new Promise((resolve, reject) => {
      const {
        reference_id,
        payment_channel,
        amount,
        callback_url,
        redirect_url,
        expired_in,
        status,
        customer_name,
        customer_email,
        customer_phone,
        note,
        qr_string,
        qr_url,
        provider_response,
        created_by,
        expires_at,
      } = payload;

      conn.query(
        `INSERT INTO merchant_qris_transactions
      (reference_id, payment_channel, amount, callback_url, redirect_url, expired_in, status,
       customer_name, customer_email, customer_phone, note, qr_string, qr_url, provider_response,
       created_by, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reference_id,
          payment_channel,
          amount,
          callback_url,
          redirect_url,
          expired_in,
          status,
          customer_name,
          customer_email,
          customer_phone,
          note,
          qr_string,
          qr_url,
          provider_response,
          created_by,
          expires_at,
        ],
        (e, result) => (e ? reject(new Error(e.message || String(e))) : resolve(result.insertId)),
      );
    }),

  createItems: ({ transaction_id, items = [] }) =>
    new Promise((resolve, reject) => {
      if (!items.length) return resolve(true);
      const values = items.map((i) => [
        transaction_id,
        i.product,
        Number(i.amount || 0),
        Number(i.qty || 0),
      ]);
      conn.query(
        `INSERT INTO merchant_qris_transaction_items(transaction_id, product, amount, qty) VALUES ?`,
        [values],
        (e) => (e ? reject(new Error(e.message || String(e))) : resolve(true)),
      );
    }),

  createCategoryItems: ({ transaction_id, categories = [] }) =>
    new Promise((resolve, reject) => {
      if (!categories.length) return resolve(true);
      const values = categories.map((c) => [
        transaction_id,
        c.category_id || null,
        c.category_name,
        Number(c.sort_no || 0),
        Number(c.qty || 0),
        Number(c.amount || 0),
      ]);

      conn.query(
        `INSERT INTO merchant_qris_transaction_categories(transaction_id, category_id, category_name, sort_no, qty, amount) VALUES ?`,
        [values],
        (e) => (e ? reject(new Error(e.message || String(e))) : resolve(true)),
      );
    }),

  findTransactionByReference: (reference_id) =>
    new Promise((resolve, reject) => {
      conn.query(
        `SELECT * FROM merchant_qris_transactions WHERE reference_id = ? LIMIT 1`,
        [reference_id],
        (e, rows) => (e ? reject(new Error(e.message || String(e))) : resolve(rows?.[0] || null)),
      );
    }),

  setTransactionStatus: ({ reference_id, status, provider_response }) =>
    new Promise((resolve, reject) => {
      conn.query(
        `UPDATE merchant_qris_transactions
         SET status = ?, paid_at = NOW()
         WHERE reference_id = ?`,
        [status, reference_id],
        (e, result) =>
          e ? reject(new Error(e.message || String(e))) : resolve(result.affectedRows > 0),
      );
    }),
};

module.exports.listTransactions = ({
  page = 1,
  limit = 10,
  search = '',
  status = '',
  sort = 'newest',
  created_by = null,
  isAdmin = false,
}) =>
  new Promise((resolve, reject) => {
    const pNum = Number(page) || 1;
    const lNum = Number(limit) || 10;
    const offset = (pNum - 1) * lNum;

    const where = [];
    const params = [];

    if (!isAdmin && created_by) {
      where.push('created_by = ?');
      params.push(created_by);
    }

    if (String(status || '').trim()) {
      where.push('status = ?');
      params.push(String(status).trim().toUpperCase());
    }

    if (String(search || '').trim()) {
      where.push('(reference_id LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)');
      const k = `%${String(search).trim()}%`;
      params.push(k, k, k);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const qCount = `SELECT COUNT(*) AS total FROM merchant_qris_transactions ${whereSql}`;
    const orderBy = String(sort || '').toLowerCase() === 'oldest' ? 'id ASC' : 'id DESC';
    const qItems = `
      SELECT id, reference_id, payment_channel, amount, status, customer_name, customer_email,
             customer_phone, qr_url, expires_at, paid_at, created_at, updated_at
      FROM merchant_qris_transactions
      ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`;

    conn.query(qCount, params, (e1, r1) => {
      if (e1) return reject(new Error(e1.message || String(e1)));
      const total = Number(r1?.[0]?.total || 0);
      const total_pages = Math.ceil(total / lNum);

      conn.query(qItems, [...params, lNum, offset], (e2, rows) => {
        if (e2) return reject(new Error(e2.message || String(e2)));
        resolve({ items: rows || [], page: pNum, limit: lNum, total, total_pages });
      });
    });
  });

module.exports.detailByReference = ({ reference_id, created_by = null, isAdmin = false }) =>
  new Promise((resolve, reject) => {
    const where = ['reference_id = ?'];
    const params = [reference_id];

    if (!isAdmin && created_by) {
      where.push('created_by = ?');
      params.push(created_by);
    }

    conn.query(
      `SELECT * FROM merchant_qris_transactions WHERE ${where.join(' AND ')} LIMIT 1`,
      params,
      (e, rows) => {
        if (e) return reject(new Error(e.message || String(e)));
        const tx = rows?.[0] || null;
        if (!tx) return resolve(null);

        conn.query(
          `SELECT id, product, amount, qty, created_at
           FROM merchant_qris_transaction_items
           WHERE transaction_id = ?
           ORDER BY id ASC`,
          [tx.id],
          (e2, itemRows) => {
            if (e2) return reject(new Error(e2.message || String(e2)));
            conn.query(
              `SELECT id, category_id, category_name, sort_no, qty, amount, created_at FROM merchant_qris_transaction_categories WHERE transaction_id = ? ORDER BY sort_no ASC, id ASC`,
              [tx.id],
              (e3, catRows) => {
                if (e3) return reject(new Error(e3.message || String(e3)));
                resolve({ ...tx, items: itemRows || [], categories: catRows || [] });
              },
            );
          },
        );
      },
    );
  });

module.exports.getCategoryById = (id, includeInactive = false) =>
  new Promise((resolve, reject) => {
    const where = includeInactive ? 'id = ?' : 'id = ? AND is_active = 1';
    conn.query(
      `SELECT id, name, qty, sort_no, is_active, created_at, updated_at FROM merchant_qris_categories WHERE ${where} LIMIT 1`,
      [id],
      (e, rows) => (e ? reject(new Error(e.message || String(e))) : resolve(rows?.[0] || null)),
    );
  });

module.exports.updateCategory = ({ id, name, qty }) =>
  new Promise((resolve, reject) => {
    conn.query(
      `UPDATE merchant_qris_categories SET name = ?, qty = ?, updated_at = NOW() WHERE id = ?`,
      [name, Number(qty || 0), id],
      (e, result) =>
        e ? reject(new Error(e.message || String(e))) : resolve(result.affectedRows > 0),
    );
  });

module.exports.softDeleteCategory = (id) =>
  new Promise((resolve, reject) => {
    conn.query(
      `UPDATE merchant_qris_categories SET is_active = 0, updated_at = NOW() WHERE id = ?`,
      [id],
      (e, result) =>
        e ? reject(new Error(e.message || String(e))) : resolve(result.affectedRows > 0),
    );
  });
