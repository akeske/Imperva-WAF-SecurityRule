const fs = require("fs/promises");

async function fetchAzureIPs() {
  const url = "https://www.microsoft.com/en-us/download/confirmation.aspx?id=56519";

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const text = await response.text();
    const downloadLinkMatch = text.match(/href="([^"]*json[^"]*)"/);

    if (!downloadLinkMatch) {
      throw new Error("Download link not found");
    }

    const downloadUrl = downloadLinkMatch[1];
    const ipResponse = await fetch(downloadUrl);

    if (!ipResponse.ok) {
      throw new Error(`HTTP error! status: ${ipResponse.status}`);
    }

    const ipData = await ipResponse.json();
    return ipData;
  } catch (error) {
    console.error("Error fetching Azure IP ranges:", error);
  }
}

function queryByName(ipData, name) {
  if (!ipData || !ipData.values) {
    console.error("Invalid IP data structure");
    return [];
  }

  return ipData.values.filter((entry) => entry.name === name);
}

function generateTerraformFile(ipData) {
  const name = "Block ALL";
  const enabled = true;
  const policyType = "ACL";

  // Extract IPs from ipData and format them for Terraform
  const microsoftIPs = ipData.map((entry) => `"${entry}"`).join(",\n                ");

  const terraformContent = `
resource "incapsula_policy" "acl_block_all_except_microsoft_ips" {
  name            = "Block ALL - Except Microsoft IPs"
  enabled         = true
  policy_type     = "ACL"
  policy_settings = <<POLICY
  [
    {
      "settingsAction": "BLOCK",
      "policySettingType": "IP",
      "data": {
        "ips": [
          "0.0.0.0-255.255.255.255"
        ]
      },
      "policyDataExceptions": [
        {
          "data": [
            {
              "exceptionType": "IP",
              "values": [
                ${microsoftIPs}
              ]
            }
          ]
        }
      ]

    }
  ]
  POLICY
}

resource "incapsula_policy" "acl_block_all" {
  name            = "Block ALL"
  enabled         = true
  policy_type     = "ACL"
  policy_settings = <<POLICY
  [
    {
      "settingsAction": "BLOCK",
      "policySettingType": "IP",
      "data": {
        "ips": [
          "0.0.0.0-255.255.255.255"
        ]
      }
    }
  ]
  POLICY
}
`;

  return terraformContent;
}

(async function () {
  const ipData = await fetchAzureIPs();
  const nameToQuery = "AzureActiveDirectory.ServiceEndpoint"; // Replace with the specific name you want to query

  if (ipData) {
    const result = queryByName(ipData, nameToQuery);
    const terraformContent = generateTerraformFile(result[0].properties.addressPrefixes);

    try {
      await fs.writeFile("main.tf", terraformContent);
      console.log("Terraform file generated successfully: main.tf");
    } catch (err) {
      console.error("Error writing Terraform file:", err);
    }
    // console.log(JSON.stringify(result, null, 2));
  }
})();
