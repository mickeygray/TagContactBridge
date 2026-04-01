// services/signatureTemplate.js
const hbs = require("handlebars");

const rawSignatureTpl = `
 <table style="width:100%;max-width:600px;margin-top:20px;
                border-top:1px solid #ccc;padding-top:10px;
                font-family:Arial,sans-serif;font-size:14px;">
    <tr>
      <td style="width:30%;padding-right:20px;text-align:center;
                 vertical-align:middle;">
        <img src="cid:emailLogo" alt="Logo"
             style="max-width:100%;height:80px; width:100px;display:block;"/>
      </td>
      <td style="width:60%;text-align:left;vertical-align:middle;
                 padding-left:20px;">
        <strong>{{contactName}}</strong><br/>
        <a href="tel:{{phone}}" style="color:#000;text-decoration:none;">
          {{phone}}
        </a><br/>
        <a href="{{url}}" style="color:#000;text-decoration:none;">
          {{url}}
        </a>

      </td>
    </tr>      

  </table>
`;

module.exports = hbs.compile(rawSignatureTpl);
