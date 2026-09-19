import fs from 'node:fs'
import path from 'node:path'
import { Version } from './components/index.js'

if (!global.segment) {
  global.segment = (await import('oicq')).segment
}
logger.info(logger.green('正在加载ark-plugin'))
const files = fs.readdirSync('./plugins/ark-plugin/apps').filter(file => file.endsWith('.js'))

let ret = []
files.forEach((file) => {
  ret.push(import(`./apps/${file}`))
})
ret = await Promise.allSettled(ret)
let apps = {}
for (let i = 0; i < files.length; i++) {
  let name = files[i].replace('.js', '')
  if (ret[i].status !== 'fulfilled') {
    logger.error(`载入插件错误：${logger.red(name)}`)
    logger.error(ret[i].reason)
    continue
  }
  apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}

// 3. Config Backup
const backupPath = './plugins/ark-plugin/config/backup.json'
if (!fs.existsSync(backupPath)) {
  fs.cpSync(
    './plugins/ark-plugin/defset/config/backup.json',
    backupPath,
    { recursive: true }
  )
}


const suffix = Version.isQsyhh ? '-qsyhh' : ''
const backupBase = `../../../ark-plugin/backup/miao-plugin-rank${suffix}`
let symlinkCount = 0
let arkInitStatus = null
let stygianInitStatus = false
const createSymlink = ({ src, dest }) => {
  try {
    const current = fs.lstatSync(src)
    if (!current.isSymbolicLink()) {
      logger.warn(`[ark-plugin] 资源路径已存在且不是软链接，未覆盖: ${src}`)
      return
    }
    const currentTarget = fs.readlinkSync(src)
    const resolvedCurrent = path.resolve(path.dirname(src), currentTarget)
    const resolvedDest = path.resolve(path.dirname(src), dest)
    if (resolvedCurrent !== resolvedDest) {
      fs.unlinkSync(src)
      fs.symlinkSync(dest, src, 'file')
    }
    symlinkCount++
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      logger.error(`检查软链接文件时出现问题 ${err}`)
      return
    }
    try {
      fs.symlinkSync(dest, src, 'file')
      symlinkCount++
    } catch (linkErr) {
      logger.error(`软链接文件时出现问题 ${linkErr}`)
    }
  }
}

let ArkInit
try {
  ArkInit = (await import(`./model/init${suffix}.js`)).default
  const ArkCfg = (await import('./components/Cfg.js')).default
  if (ArkCfg.get('lnFiles', false)) {
    const links = [
      {
        src: './plugins/miao-plugin/resources/character/profile-detail-ark.html',
        dest: `${backupBase}/resources/character/profile-detail.html`
      }
    ]

    if (Version.isQsyhh) {
      links.push({
        src: './plugins/miao-plugin/resources/character/rank-profile-list-ark.css',
        dest: `${backupBase}/resources/character/rank-profile-list.css`
      })
    }

    links.push({
      src: './plugins/miao-plugin/resources/character/rank-profile-list-ark.html',
      dest: `${backupBase}/resources/character/rank-profile-list.html`
    })

    links.forEach(createSymlink)
  }
} catch (err) {
  logger.warn(`[ark-plugin] 功能注入失败: ${err?.message || err}`)
}

if (ArkInit?.init) {
  try {
    const status = ArkInit.init()
    if (status) {
      arkInitStatus = status
    }
  } catch (err) {
    logger.warn('ProfileRank 初始化失败', err)
  }
}

let stygianInit
try {
  stygianInit = (await import(`./model/stygian-init${suffix}.js`)).default
} catch (err) {
  logger.warn('幽境危战排名初始化失败')
  logger.warn(err)
}

if (stygianInit?.init) {
  try {
    stygianInitStatus = stygianInit.init() !== false
  } catch (err) {
    logger.error('幽境危战初始化失败', err)
  }
}

const lnStatus = symlinkCount > 0
  ? logger.green(`✔ 已链接 ${symlinkCount} 个文件`)
  : logger.red('⚠ 未启用或无链接')
const profileDetailStatus = arkInitStatus?.ProfileDetail || logger.red('✖ 注入失败（初始化异常）')
const charRankStatus = arkInitStatus?.CharRank || logger.red('✖ 注入失败（初始化异常）')
const stygianStatus = stygianInitStatus
  ? logger.green('✔ 注入成功')
  : logger.red('✖ 注入失败')
let uiOutput = `
${logger.green('==============ark-plugin加载完毕===============')}
软链接状态: ${lnStatus}
功能注入:
  - ProfileDetail: ${profileDetailStatus}
  - ProfileRank:   ${charRankStatus}
  - 幽境危战排名:  ${stygianStatus}
`
if (arkInitStatus?.shouldReplace) {
  uiOutput += `
${logger.red('⚠ 当前miao-plugin版本缺少ark所需模块，相关功能已跳过；请更新ark-plugin或miao-plugin，不要覆盖miao核心文件')}
`
}
uiOutput += `
${logger.green('miao-plugin 核心 JavaScript 未被覆盖；自动推荐仍由当前 miao 面板逻辑处理')}
`
if (arkInitStatus?.profileRank?.state === 'incompatible') {
  uiOutput += `
${logger.yellow(`ProfileRank Ark 增强已跳过：${arkInitStatus.profileRank.reason || '当前接口不兼容'}；普通 miao 排行保持不变`)}
`
}

logger.info(uiOutput)
export { apps }
