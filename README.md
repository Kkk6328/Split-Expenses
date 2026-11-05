# 暖暖分帳

溫馨、無廣告的繁體中文分帳工具，支援手機、逐筆手動匯率、平均分攤、還款紀錄與 CSV 匯出。

## 免費架構

- 前端：GitHub Pages，main 根目錄 index.html。
- 雲端：Firebase Spark（Google Authentication + Firestore），不使用 Cloud Functions、不需要信用卡。到達免費額度會暫停服務，不自動升級。
- LINE：LIFF 開啟、LINE 登入顯示暱稱、使用者手動分享邀請。免費雲端帳本另用 Google 登入驗證身分；LINE 暱稱不作為 Firebase 授權憑據。LINE 內嵌瀏覽器的 Google 登入會引導到外部瀏覽器。
- 本機帳本：不登入也能使用，保留在該瀏覽器，清除資料會遺失，請定期匯出。

## Firebase 管理員設定

1. Firebase Web App 公開設定位於 config.js。Google 登入啟用；Authentication 授權網域包含 kkk6328.github.io。
2. 建立 Firestore Standard 預設資料庫，使用正式規則。將本專案 firestore.rules 原樣發布；不可改成開放讀寫。
3. 建立者可產生 7 天有效的隨機邀請連結。連結持有人登入 Google 後可加入並讀寫全部帳本內容。每本最多 30 個登入帳號。只將邀請傳給信任的夥伴。
4. 共用帳本載入與「同步」會抓取最新內容。寫入採交易版本檢查，避免覆蓋他人更新。Google 登出會清除本機的共用帳本快取，雲端仍保留。

## LINE 管理員設定

Provider：暖暖分帳（2005720216）。LINE Login Channel：2012396328（Web app，Taiwan）。LIFF ID：2012396328-SmwrIxyy。LIFF Endpoint 為 https://kkk6328.github.io/Split-Expenses/ ，Size Full，Scopes profile / openid。將 LIFF ID 填入 config.js。相關條款需帳號持有人確認，分享選擇器的資訊使用同意也需持有人確認。開啟 share target picker 後，使用者自行選擇分享對象；未開啟時可複製邀請連結貼至 LINE。

禁止在公開 config.js 放 Channel Secret、service-account keys 或私密憑證。

## 金額

匯率方向為「1 單位原幣 = 多少 TWD」，每筆獨立保存，更新其他筆的匯率不影響舊帳。換算至台幣分後平均分攤，餘數依選取順序分配，總額完全一致。還款僅記錄、不實際轉帳。CSV 對公式字元做前綴保護。

## 限制與驗證

每本最多 1000 筆花費、1000 筆還款。所有加入者均可編輯，尚無逐人權限、刪除帳本或稽核歷史；夥伴暱稱與 Google 登入帳號不同。沒有自動讀取 LINE 群組成員、背景機器人、自動即時同步。每筆匯率與結算核心已測試；雲端需規則發布與 Google 登入後驗證建立、寫入、邀請、另一帳號加入、非成員拒絕與版本衝突。functions/ 為舊版選配程式，不屬於免費版部署；firebase.json 不會部署它。
