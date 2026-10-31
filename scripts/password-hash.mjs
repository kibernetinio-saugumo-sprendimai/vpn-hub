import { randomBytes, scryptSync } from 'node:crypto'
import { stdin, stdout } from 'node:process'
if (!stdin.isTTY) {
  let input = ''
  for await (const chunk of stdin) input += chunk
  printHash(input.replace(/\r?\n$/, ''))
} else {
  stdout.write('Administratoriaus slaptažodis (bent 16 simbolių): ')
  stdin.setRawMode(true)
  stdin.setEncoding('utf8')
  let password = ''
  stdin.on('data', chunk => {
    for (const char of chunk) {
      if (char === '\u0003') process.exit(1)
      if (char === '\r' || char === '\n') { stdin.setRawMode(false); stdout.write('\n'); printHash(password); process.exit(0) }
      else if (char === '\u007f') password = password.slice(0, -1)
      else password += char
    }
  })
}
function printHash(password) {
  if (password.length < 16 || password.length > 1024) { console.error('Slaptažodis turi būti 16–1024 simbolių.'); process.exit(1) }
  const salt = randomBytes(16).toString('hex')
  console.log(`ADMIN_PASSWORD_HASH=${salt}:${scryptSync(password, salt, 64).toString('hex')}`)
}
