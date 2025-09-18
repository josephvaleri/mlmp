import { test, expect } from '@playwright/test'

test.describe('MLMP Application', () => {
  test('should load the main page', async ({ page }) => {
    await page.goto('/')
    
    await expect(page.locator('h1')).toContainText('Machine Learning Menu Processor')
    await expect(page.locator('.upload-area')).toBeVisible()
  })

  test('should show upload area initially', async ({ page }) => {
    await page.goto('/')
    
    const uploadArea = page.locator('.upload-area')
    await expect(uploadArea).toBeVisible()
    await expect(uploadArea).toContainText('Click to upload or drag and drop')
    await expect(uploadArea).toContainText('Supports JPG, PNG, and PDF files up to 10MB')
  })

  test('should handle file input click', async ({ page }) => {
    await page.goto('/')
    
    // Create a mock file input
    await page.evaluate(() => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.jpg,.jpeg,.png,.pdf'
      input.id = 'file-input'
      document.body.appendChild(input)
    })

    // Click the upload area
    await page.locator('.upload-area').click()
    
    // The file input should be triggered (we can't easily test the actual file dialog)
    // But we can verify the upload area is clickable
    await expect(page.locator('.upload-area')).toBeVisible()
  })

  test('should show keyboard shortcuts', async ({ page }) => {
    await page.goto('/')
    
    const shortcuts = page.locator('.keyboard-shortcuts')
    await expect(shortcuts).toBeVisible()
    await expect(shortcuts).toContainText('Keyboard shortcuts:')
    await expect(shortcuts).toContainText('↑↓')
    await expect(shortcuts).toContainText('A')
    await expect(shortcuts).toContainText('D')
    await expect(shortcuts).toContainText('E')
  })

  test('should have proper page structure', async ({ page }) => {
    await page.goto('/')
    
    // Check main container
    await expect(page.locator('.mlmp-container')).toBeVisible()
    
    // Check header
    await expect(page.locator('.mlmp-header')).toBeVisible()
    await expect(page.locator('.mlmp-header h1')).toBeVisible()
    await expect(page.locator('.mlmp-header p')).toBeVisible()
    
    // Check content area
    await expect(page.locator('.mlmp-content')).toBeVisible()
    await expect(page.locator('.mlmp-main')).toBeVisible()
    await expect(page.locator('.mlmp-sidebar')).toBeVisible()
  })

  test('should handle drag and drop events', async ({ page }) => {
    await page.goto('/')
    
    const uploadArea = page.locator('.upload-area')
    
    // Test drag over
    await uploadArea.dispatchEvent('dragover', {
      dataTransfer: new DataTransfer()
    })
    
    // The upload area should still be visible
    await expect(uploadArea).toBeVisible()
  })

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    
    // Check that the page loads on mobile
    await expect(page.locator('.mlmp-container')).toBeVisible()
    await expect(page.locator('.upload-area')).toBeVisible()
  })
})
