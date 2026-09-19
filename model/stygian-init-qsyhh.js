import ProfileList from '../../miao-plugin/apps/profile/ProfileList.js'
import { getStygianVersion } from '../../ark-plugin/model/calcVersion.js'
import ProfileServ from '../../miao-plugin/models/serv/ProfileServ.js'
import ArkCfg from '../components/Cfg.js'
const stygianInit = {
  init() {
    if (!ArkCfg.get('stygianRank', false)) {
      return false
    }
    if (!ProfileList.doRefresh._arkStygianWrapped) {
      const originalDoRefresh = ProfileList.doRefresh.bind(ProfileList)
      const wrappedDoRefresh = async (e, ...args) => {
        const result = await originalDoRefresh(e, ...args)
        try {
          const uid = e.uid
          const bindThisUid = e.runtime?.user && e.game === 'gs'
            ? e.runtime.user.hasUid(uid, e.game)
            : false
          if (uid && e.group_id && bindThisUid) {
            const stygianVersion = getStygianVersion()
            const stygianTime = await redis.get(`ark-plugin:stygianInfo:${stygianVersion}:${uid}`)
            if (stygianTime && String(stygianTime) !== '-1') {
              await redis.zAdd(`ark-plugin:stygianRank:${stygianVersion}:${e.group_id}`, {
                score: stygianTime,
                value: String(uid)
              })
            }
          }
        } catch (err) {
          logger.error('幽境危战排名更新失败', err)
        }
        return result
      }
      wrappedDoRefresh._arkStygianWrapped = true
      ProfileList.doRefresh = wrappedDoRefresh
    }
    if (!ProfileServ.prototype.updatePlayer._arkStygianWrapped) {
      const originalUpdatePlayer = ProfileServ.prototype.updatePlayer
      const wrappedUpdatePlayer = function (player, data) {
        const stygianVersion = getStygianVersion()
        if (data?.uid && stygianVersion !== -1) {
          const score = data.playerInfo?.stygianSeconds && data.playerInfo?.stygianIndex
            ? data.playerInfo.stygianSeconds + (6 - data.playerInfo.stygianIndex) * 2048
            : -1
          void redis.set(`ark-plugin:stygianInfo:${stygianVersion}:${data.uid}`, score).catch((err) => {
            logger.error('幽境危战数据缓存失败', err)
          })
        }
        return originalUpdatePlayer.call(this, player, data)
      }
      wrappedUpdatePlayer._arkStygianWrapped = true
      ProfileServ.prototype.updatePlayer = wrappedUpdatePlayer
    }
    return true
  }
}
export default stygianInit
