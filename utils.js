const { default: axios } = require('axios');
const bcrypt = require('bcryptjs');

module.exports = {
  async checkPasswordEncrypt(password, passwordOld) {
    var isValid = await bcrypt.compare(password, passwordOld);
    return isValid;
  },
  formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  },
  sendFCM: async (title, body, token, type, data) => {
    try {
      await axios.post(process.env.FCM_OFFICE_URL, {
        token: token,
        title: title,
        body: body,
        broadcast_type: type,
        inbox_id: String(data.inbox_id),
        field_3: String(data.field_3),
        field_4: String(data.field_4),
        field_5: String(data.field_5),
        field_6: String(data.field_6),
      });
    } catch (e) {
      console.log(e);
    }
  },
};
