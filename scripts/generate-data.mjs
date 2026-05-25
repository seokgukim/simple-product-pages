#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFileSync } from 'child_process'
import crypto from 'crypto'

const cwd = process.cwd()
const dataDir = path.join(cwd, 'public', 'data')
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-data-'))
const backupDir = path.join(tmpDir, 'backup-assets')

function log(...args) {
  console.log('[generate-data]', ...args)
}

// Optional Google Drive credentials (set in environment)
const GOOGLE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY || process.env.GOOGLE_API_KEY
const GOOGLE_OAUTH_TOKEN = process.env.GOOGLE_DRIVE_ACCESS_TOKEN || process.env.GOOGLE_OAUTH_TOKEN
// Optional site title override from environment
const SIMPLE_PRODUCT_PAGES_TITLE = process.env.SIMPLE_PRODUCT_PAGES_TITLE

function sanitizeFileName(name) {
  return name.replace(/[\/\\<>:"|?*\x00-\x1F]/g, '-').replace(/\s+$/,'')
}

function buildApiUrl(base, params = {}) {
  const u = new URL(base)
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v)
  }
  if (GOOGLE_API_KEY) u.searchParams.set('key', GOOGLE_API_KEY)
  return u.toString()
}

async function fetchJsonWithAuth(url) {
  const headers = {}
  if (GOOGLE_OAUTH_TOKEN) headers['Authorization'] = `Bearer ${GOOGLE_OAUTH_TOKEN}`
  const res = await fetch(url, { headers, redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

async function fetchArrayBufferWithAuth(url) {
  const headers = {}
  if (GOOGLE_OAUTH_TOKEN) headers['Authorization'] = `Bearer ${GOOGLE_OAUTH_TOKEN}`
  const res = await fetch(url, { headers, redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`)
  }
  return res.arrayBuffer()
}

function getDriveIdFromUrl(u) {
  try {
    const url = new URL(u)
    const m = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/)
    if (m) return m[1]
    const qid = url.searchParams.get('id')
    if (qid) return qid
    const m2 = url.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/)
    if (m2) return m2[1]
    return null
  } catch (e) {
    return null
  }
}

const exportMimeMap = {
  'application/vnd.google-apps.document': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: '.docx' },
  'application/vnd.google-apps.spreadsheet': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' },
  'application/vnd.google-apps.presentation': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: '.pptx' }
}

async function downloadDriveFile(file, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  let outName = sanitizeFileName(file.name || file.id)
  let url
  const isGoogleNative = file.mimeType && file.mimeType.startsWith('application/vnd.google-apps.')
  if (isGoogleNative) {
    const mapping = exportMimeMap[file.mimeType]
    if (!mapping) {
      log('Skipping unsupported Google-native file:', file.name, file.mimeType)
      return
    }
    outName += mapping.ext
    url = buildApiUrl(`https://www.googleapis.com/drive/v3/files/${file.id}/export`, { mimeType: mapping.mime })
  } else {
    url = buildApiUrl(`https://www.googleapis.com/drive/v3/files/${file.id}`, { alt: 'media' })
  }
  const outPath = path.join(destDir, outName)

  // If metadata is present, try to skip unchanged files
  try {
    if (fs.existsSync(outPath)) {
      const stat = fs.statSync(outPath)
      if (file.size && Number(file.size) === stat.size) {
        log('Skipping unchanged (size match):', outName)
        return
      }
      if (file.md5Checksum) {
        try {
          const existingMd5 = crypto.createHash('md5').update(fs.readFileSync(outPath)).digest('hex')
          if (existingMd5 === file.md5Checksum) {
            log('Skipping unchanged (md5):', outName)
            return
          }
        } catch (err) {
          // ignore md5 errors and fall back to download
        }
      }
    }
  } catch (err) {
    // ignore stat errors and continue to download
  }

  log('Downloading', file.name, '->', outPath)
  try {
    const arrayBuffer = await fetchArrayBufferWithAuth(url)
    fs.writeFileSync(outPath, Buffer.from(arrayBuffer))
  } catch (err) {
    log('Failed to download', file.name, err.message)
  }
}

async function downloadDriveFolder(folderId, destDir, isRoot = false) {
  fs.mkdirSync(destDir, { recursive: true })
  log('Listing folder', folderId)
  const topLevelSeen = new Set()
  let pageToken = null
  do {
    const params = { q: `'${folderId}' in parents and trashed=false`, fields: 'nextPageToken, files(id, name, mimeType, md5Checksum, size, modifiedTime)', pageSize: '1000' }
    if (pageToken) params.pageToken = pageToken
    const url = buildApiUrl('https://www.googleapis.com/drive/v3/files', params)
    const data = await fetchJsonWithAuth(url)
    for (const f of data.files || []) {
      const name = sanitizeFileName(f.name || f.id)
      if (isRoot && f.mimeType === 'application/vnd.google-apps.folder') {
        topLevelSeen.add(name)
      }
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        await downloadDriveFolder(f.id, path.join(destDir, name), false)
      } else {
        await downloadDriveFile(f, destDir)
      }
    }
    pageToken = data.nextPageToken
  } while (pageToken)
  return isRoot ? topLevelSeen : null
}

// --- HTML fallback helpers for public shared folders ---
async function fetchTextWithAuth(url) {
  const headers = { 'User-Agent': 'Mozilla/5.0 (Node)' }
  if (GOOGLE_OAUTH_TOKEN) headers['Authorization'] = `Bearer ${GOOGLE_OAUTH_TOKEN}`
  const res = await fetch(url, { headers, redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`)
  }
  return res.text()
}

function stripHtmlTags(str) {
  return (str || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function extractNameFromAnchor(attrs, inner) {
  if (!attrs && !inner) return null
  let m = attrs && attrs.match(/title="([^"]+)"/i)
  if (!m) m = attrs && attrs.match(/aria-label="([^"]+)"/i)
  if (!m) m = attrs && attrs.match(/data-tooltip="([^"]+)"/i)
  if (m) return stripHtmlTags(m[1])
  const txt = stripHtmlTags(inner)
  if (txt) return txt
  return null
}

async function htmlDownloadFile(fileId, fallbackName, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  const safeBase = sanitizeFileName(fallbackName || fileId)
  let outPath = path.join(destDir, safeBase)
  const headers = { 'User-Agent': 'Mozilla/5.0 (Node)' }
  if (GOOGLE_OAUTH_TOKEN) headers['Authorization'] = `Bearer ${GOOGLE_OAUTH_TOKEN}`
  try {
    log('HTML fallback: downloading file', fileId)
    let res = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`, { headers, redirect: 'follow' })
    // if response contains an explicit filename, use it
    const cd = res.headers.get('content-disposition')
    if (cd) {
      const fm = cd.match(/filename\*?=(?:UTF-8'')?\"?([^\";]+)\"?/i)
      if (fm) outPath = path.join(destDir, sanitizeFileName(decodeURIComponent(fm[1])))
    }

    const ct = (res.headers.get('content-type') || '')
    if (!ct.includes('text/html')) {
      const arrayBuffer = await res.arrayBuffer()
      fs.writeFileSync(outPath, Buffer.from(arrayBuffer))
      return
    }

    // If we got HTML, try to find a direct download link (confirm token or uc link)
    const text = await res.text()
    // look for /uc?export=download&confirm=... link
    let linkMatch = text.match(/href="([^\"]*uc\?export=download[^\"]*)"/i)
    if (linkMatch) {
      let dl = linkMatch[1].replace(/&amp;/g, '&')
      if (dl.startsWith('/')) dl = 'https://drive.google.com' + dl
      const r2 = await fetch(dl, { headers, redirect: 'follow' })
      if (r2.ok && !((r2.headers.get('content-type') || '').includes('text/html'))) {
        const cd2 = r2.headers.get('content-disposition')
        if (cd2) {
          const fm2 = cd2.match(/filename\*?=(?:UTF-8'')?\"?([^\";]+)\"?/i)
          if (fm2) outPath = path.join(destDir, sanitizeFileName(decodeURIComponent(fm2[1])))
        }
        const arrayBuffer = await r2.arrayBuffer()
        fs.writeFileSync(outPath, Buffer.from(arrayBuffer))
        return
      }
    }

    // try to extract confirm token
    const confirmMatch = text.match(/confirm=([0-9A-Za-z-_]+)&/i)
    if (confirmMatch) {
      const token = confirmMatch[1]
      const dlUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${token}`
      const r3 = await fetch(dlUrl, { headers, redirect: 'follow' })
      if (r3.ok && !((r3.headers.get('content-type') || '').includes('text/html'))) {
        const arrayBuffer = await r3.arrayBuffer()
        fs.writeFileSync(outPath, Buffer.from(arrayBuffer))
        return
      }
    }

    // fallback: save the HTML view so user can inspect why download failed
    fs.writeFileSync(outPath + '.html', text)
    log('Saved HTML view for', fileId, '->', outPath + '.html')
  } catch (err) {
    log('HTML download failed for', fileId, err.message)
  }
}

async function htmlDownloadSharedFolder(folderUrl, destDir) {
  const folderId = getDriveIdFromUrl(folderUrl) || (new URL(folderUrl)).searchParams.get('id')
  if (!folderId) throw new Error('Invalid folder URL for HTML fallback')
  const embedUrl = `https://drive.google.com/embeddedfolderview?id=${folderId}#list`
  log('HTML fallback: fetching embedded view', embedUrl)
  const html = await fetchTextWithAuth(embedUrl)

  // find anchors and extract file/folder ids and names
  const anchorRegex = /<a[^>]+href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/gmi
  const files = new Map()
  const folders = new Map()
  let m
  while ((m = anchorRegex.exec(html))) {
    let href = (m[1] || '').replace(/&amp;/g, '&')
    const attrs = m[2] || ''
    const inner = m[3] || ''
    const fileMatch = href.match(/\/file\/d\/([A-Za-z0-9_-]+)/)
    if (fileMatch) {
      const id = fileMatch[1]
      const name = extractNameFromAnchor(attrs, inner) || id
      if (!files.has(id)) files.set(id, name)
      continue
    }
    const folderMatch = href.match(/\/drive\/folders\/([A-Za-z0-9_-]+)/)
    if (folderMatch) {
      const id = folderMatch[1]
      const name = extractNameFromAnchor(attrs, inner) || id
      if (!folders.has(id)) folders.set(id, name)
      continue
    }
    const openMatch = href.match(/[?&]id=([A-Za-z0-9_-]+)/)
    if (openMatch) {
      const id = openMatch[1]
      const name = extractNameFromAnchor(attrs, inner) || id
      if (!files.has(id)) files.set(id, name)
    }
  }

  // download files (top-level)
  for (const [id, name] of files) {
    await htmlDownloadFile(id, name, destDir)
  }

  // recurse into folders found on the page
  for (const [id, name] of folders) {
    const subdir = path.join(destDir, sanitizeFileName(name))
    await htmlDownloadSharedFolder(`https://drive.google.com/drive/folders/${id}`, subdir)
  }
}

async function tryDownloadFolder(folderId, destDir) {
  try {
    const topLevel = await downloadDriveFolder(folderId, destDir, true)
    return topLevel
  } catch (err) {
    log('Drive API listing failed, falling back to HTML parsing:', err.message)
    await htmlDownloadSharedFolder(`https://drive.google.com/drive/folders/${folderId}`, destDir)
    return null
  }
}

async function main() {
  log('Starting')

  // Backup existing assets if present
  if (fs.existsSync(dataDir)) {
    const assetsSrc = path.join(dataDir, 'assets')
    if (fs.existsSync(assetsSrc)) {
      fs.cpSync(assetsSrc, backupDir, { recursive: true })
      log('Backed up existing assets to', backupDir)
    }
  }

  const googleUrl = process.env.GOOGLE_DRIVE_SHARED_ENDPOINT
  if (!googleUrl) {
    log('GOOGLE_DRIVE_SHARED_ENDPOINT not set. Skipping download.')
    fs.mkdirSync(dataDir, { recursive: true })
    // restore backup if no assets in dataDir
    const assetsDest = path.join(dataDir, 'assets')
    if (!fs.existsSync(assetsDest) && fs.existsSync(backupDir)) {
      fs.cpSync(backupDir, assetsDest, { recursive: true })
      log('Restored backup assets to', assetsDest)
    }
    log('Running generate-products')
    execFileSync(process.execPath, ['./scripts/generate-products.mjs'], { stdio: 'inherit' })
    return
  }

  // Ensure public/data exists (do not remove existing files to allow incremental sync)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  log('Downloading from', googleUrl)
  const folderId = getDriveIdFromUrl(googleUrl)
  if (folderId) {
    log('Detected Google Drive folder id', folderId)
    try {
      const topLevelSet = await tryDownloadFolder(folderId, dataDir)
      log('Folder download completed')
      if (topLevelSet && topLevelSet.size > 0) {
        try {
          const existing = fs.readdirSync(dataDir, { withFileTypes: true })
          for (const ent of existing) {
            if (!ent.isDirectory()) continue
            if (ent.name === 'assets') continue
            if (!topLevelSet.has(ent.name)) {
              const toRemove = path.join(dataDir, ent.name)
              fs.rmSync(toRemove, { recursive: true, force: true })
              log('Removed stale directory', ent.name)
            }
          }
        } catch (err) {
          log('Prune failed:', err.message)
        }
      }
    } catch (err) {
      log('Error downloading folder:', err.message)
      // restore backup assets
      const assetsDest = path.join(dataDir, 'assets')
      if (!fs.existsSync(assetsDest) && fs.existsSync(backupDir)) {
        fs.cpSync(backupDir, assetsDest, { recursive: true })
        log('Restored backup assets to', assetsDest)
      }
      throw err
    }
  } else {
    // fallback: try to download the googleUrl as a single archive/file
    const res = await fetch(googleUrl, { redirect: 'follow' })
    if (!res.ok) {
      throw new Error(`Download failed: ${res.status} ${res.statusText}`)
    }

    // Determine filename
    let filename = 'data.zip'
    const cd = res.headers.get('content-disposition')
    if (cd) {
      const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
      if (m) filename = decodeURIComponent(m[1])
    } else {
      try {
        const u = new URL(googleUrl)
        const base = path.basename(u.pathname)
        if (base) filename = base
      } catch (e) {}
    }

    const tmpFile = path.join(tmpDir, filename)
    const arrayBuffer = await res.arrayBuffer()
    fs.writeFileSync(tmpFile, Buffer.from(arrayBuffer))
    log('Saved download to', tmpFile)

    // Extract
    const lower = filename.toLowerCase()
    try {
      if (lower.endsWith('.zip') || (res.headers.get('content-type') || '').includes('zip')) {
        log('Extracting zip')
        execFileSync('unzip', ['-o', tmpFile, '-d', dataDir], { stdio: 'inherit' })
      } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || (res.headers.get('content-type') || '').includes('gzip')) {
        log('Extracting tar.gz')
        execFileSync('tar', ['-xzf', tmpFile, '-C', dataDir], { stdio: 'inherit' })
      } else {
        // try unzip as fallback
        try {
          log('Trying unzip fallback')
          execFileSync('unzip', ['-o', tmpFile, '-d', dataDir], { stdio: 'inherit' })
        } catch (err) {
          log('Unknown archive type. Saving file as-is to data directory')
          fs.copyFileSync(tmpFile, path.join(dataDir, filename))
        }
      }
    } catch (err) {
      log('Extraction failed:', err.message)
      const assetsDest = path.join(dataDir, 'assets')
      if (!fs.existsSync(assetsDest) && fs.existsSync(backupDir)) {
        fs.cpSync(backupDir, assetsDest, { recursive: true })
        log('Restored backup assets to', assetsDest)
      }
      throw err
    }
  }

  // Restore backup assets if no assets dir exists after extraction/download
  const assetsDest = path.join(dataDir, 'assets')
  if (!fs.existsSync(assetsDest) && fs.existsSync(backupDir)) {
    fs.cpSync(backupDir, assetsDest, { recursive: true })
    log('Restored backup assets to', assetsDest)
  }

  // Ensure assets dir exists and write title.txt from env if provided
  try {
    fs.mkdirSync(assetsDest, { recursive: true })
    const titlePath = path.join(assetsDest, 'title.txt')
    if (SIMPLE_PRODUCT_PAGES_TITLE) {
      fs.writeFileSync(titlePath, SIMPLE_PRODUCT_PAGES_TITLE, 'utf8')
      log('Wrote title from SIMPLE_PRODUCT_PAGES_TITLE to', titlePath)
    } else if (!fs.existsSync(titlePath)) {
      const defaultTitle = 'Simple Product Pages'
      fs.writeFileSync(titlePath, defaultTitle, 'utf8')
      log('Wrote default title to', titlePath)
    } else {
      log('title.txt already exists at', titlePath)
    }
  } catch (err) {
    log('Failed to write title.txt:', err.message)
  }

  // Run generate-products
  log('Running generate-products')
  execFileSync(process.execPath, ['./scripts/generate-products.mjs'], { stdio: 'inherit' })
  log('generate-data completed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
