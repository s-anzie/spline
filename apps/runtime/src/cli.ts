import { stdin, stdout } from "node:process";
import {
  readRuntimeConfig,
  runtimeConfigPath,
  writeRuntimeConfig,
} from "./runtime-config";

async function readSecret(prompt: string): Promise<string> {
  if (!stdin.isTTY || !stdin.setRawMode)
    throw new Error("An interactive terminal is required");
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    function cleanup() {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdout.write("\n");
    }
    function onData(chunk: string) {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u007f") {
          if (value) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
        } else if (character >= " ") {
          value += character;
          stdout.write("•");
        }
      }
    }
    stdin.on("data", onData);
  });
}

async function main() {
  const [resource, action, argument, secretArgument] = process.argv.slice(2);
  const config = readRuntimeConfig();
  if (resource === "token" && action === "set") {
    const token = (
      argument ?? (await readSecret("Nouveau token machine : "))
    ).trim();
    if (!/^machine_[^.]+\..+$/.test(token))
      throw new Error("Invalid machine token format");
    writeRuntimeConfig({ ...config, machineToken: token });
    console.log(
      `Token enregistré dans ${runtimeConfigPath()} (permissions 0600). Le daemon va se reconnecter automatiquement.`,
    );
    return;
  }
  if (resource === "hub" && action === "set" && argument) {
    writeRuntimeConfig({ ...config, hubUrl: argument.replace(/\/$/, "") });
    console.log(`Hub configuré sur ${argument}.`);
    return;
  }
  if (resource === "agent-token" && action === "set" && argument) {
    const token = (
      secretArgument ?? (await readSecret(`Token de l’agent ${argument} : `))
    ).trim();
    if (!/^agent_[^.]+\..+$/.test(token))
      throw new Error("Invalid agent token format");
    writeRuntimeConfig({
      ...config,
      agentTokens: { ...config.agentTokens, [argument]: token },
    });
    console.log(
      `Token de l’agent ${argument} enregistré. Le daemon le rechargera automatiquement.`,
    );
    return;
  }
  if (resource === "agent-token" && action === "remove" && argument) {
    const agentTokens = { ...config.agentTokens };
    delete agentTokens[argument];
    writeRuntimeConfig({ ...config, agentTokens });
    console.log(`Token local de l’agent ${argument} supprimé.`);
    return;
  }
  if (resource === "status") {
    console.log(
      `Config: ${runtimeConfigPath()}\nHub: ${config.hubUrl}\nToken machine: ${config.machineToken ? "configuré" : "absent"}\nTokens agents: ${Object.keys(config.agentTokens ?? {}).length}`,
    );
    return;
  }
  console.log(
    "Usage:\n  runtime-config token set [token]\n  runtime-config agent-token set <agent-id> [token]\n  runtime-config agent-token remove <agent-id>\n  runtime-config hub set <url>\n  runtime-config status",
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
