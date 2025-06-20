// services/signatureTemplate.js
const hbs = require("handlebars");

const rawSignatureTpl = `
  <p style="font-family:Arial,sans-serif;font-size:14px;margin-top:10px;">
      <a
              href="{{scheduleUrl}}"
              style="padding: 10px 20px; background-color: #2a7ae2; color: #fff; text-decoration: none; border-radius: 5px;"
            >Schedule Your Call</a>
  </p>



  <table style="width:100%;max-width:600px;margin-top:20px;
                border-top:1px solid #ccc;padding-top:10px;
                font-family:Arial,sans-serif;font-size:14px;">
    <tr>
      <td style="width:40%;padding-right:20px;text-align:center;
                 vertical-align:middle;">
        <img src="{{logoSrc}}" alt="Logo"
             style="max-width:100%;height:100px; width:50px;display:block;"/>
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
    <tr>
        <td
          align="center"
          style="padding: 30px 0 0; font-size: 13px; color: #777"
        >
          <p>
            If you'd like to unsubscribe from future emails, click
            <a href="<%asm_global_unsubscribe_url%>">here</a>.
          </p>
        </td>
      </tr>
  </table>
`;

module.exports = hbs.compile(rawSignatureTpl);
