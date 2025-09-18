# Machine Learning Menu Processor (MLMP)

A production-ready full-stack application that uses OCR and machine learning to extract entree names from restaurant menus. Users can upload menu images or PDFs, review AI-generated candidates, and train the system to improve accuracy over time.

## 🚀 Features

- **Multi-format Support**: Upload JPG, PNG, or PDF files
- **Advanced OCR**: Browser-based text extraction using Tesseract.js
- **Smart Candidate Detection**: Heuristic + ML hybrid approach to identify entree names
- **Interactive Review**: Approve, deny, or edit candidates with keyboard shortcuts
- **Machine Learning**: TensorFlow.js binary classifier that learns from user feedback
- **Public API**: RESTful endpoints for external integration
- **Real-time Processing**: Fast OCR and candidate extraction
- **Responsive UI**: Modern React interface with drag-and-drop upload

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React UI      │    │   OCR Engine    │    │   ML Model      │
│   - Upload      │───▶│   - Tesseract   │───▶│   - TensorFlow  │
│   - Review      │    │   - PDF.js      │    │   - Training    │
│   - Approval    │    │   - Features    │    │   - Prediction  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                    ┌─────────────────┐
                    │   Supabase      │
                    │   - PostgreSQL  │
                    │   - Storage     │
                    │   - Auth        │
                    └─────────────────┘
```

## 📋 Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- Modern web browser with JavaScript enabled

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd mlmp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Supabase**
   - Create a new Supabase project
   - Run the database migrations:
     ```bash
     npx supabase db push
     ```
   - Set up storage bucket:
     ```bash
     npx supabase storage create mlmp
     ```

4. **Configure environment variables**
   ```bash
   cp env.example .env.local
   ```
   
   Update `.env.local` with your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   VITE_OCR_PROVIDER=tesseract
   VITE_DEV_MODE=true
   ```

5. **Seed the database (optional)**
   ```bash
   npm run db:seed
   ```

6. **Start the development server**
   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:3000`

## 🧪 Testing

### Unit Tests
```bash
npm run test
```

### End-to-End Tests
```bash
npm run test:e2e
```

### Test Coverage
The test suite covers:
- Candidate detection algorithms
- Feature extraction functions
- ML model components
- UI interactions
- API endpoints

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api/mlmp
```

### Authentication
API endpoints support both:
- **Service Key**: For server-to-server communication
- **JWT Token**: For user-authenticated requests

### Endpoints

#### Process Menu
```http
POST /api/mlmp/process
Content-Type: multipart/form-data

file: [menu file]
```

**Response:**
```json
{
  "menu_id": "uuid",
  "candidates": [
    {
      "id": "uuid",
      "text": "Vitello alla Milanese",
      "confidence": 0.86,
      "page": 1
    }
  ]
}
```

#### Get Approved Entrees
```http
GET /api/mlmp/entrees?menu_id=uuid
```

**Response:**
```json
{
  "menu_id": "uuid",
  "entrees": [
    "Vitello alla Milanese",
    "Pollo al Limone"
  ]
}
```

#### Label Candidate
```http
POST /api/mlmp/label
Content-Type: application/json
Authorization: Bearer <token>

{
  "line_id": "uuid",
  "label": "approve|deny|edit",
  "edited_text": "Corrected name" // required for edit
}
```

**Response:**
```json
{
  "success": true,
  "label_id": "uuid"
}
```

#### Train Model
```http
POST /api/mlmp/train
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "success": true,
  "version": "v2025-01-16-1",
  "metrics": {
    "precision": 0.91,
    "recall": 0.88,
    "f1": 0.895
  },
  "training_samples": 150,
  "validation_samples": 38
}
```

#### Get Training Status
```http
GET /api/mlmp/train
```

**Response:**
```json
{
  "latest_model": {
    "version": "v2025-01-16-1",
    "created_at": "2025-01-16T10:30:00Z",
    "metrics": {
      "precision": 0.91,
      "recall": 0.88,
      "f1": 0.895
    }
  },
  "training_stats": {
    "total_labels": 188,
    "approved_count": 95,
    "denied_count": 78,
    "edited_count": 15
  },
  "can_train": true
}
```

## 🎯 Usage

### Web Interface

1. **Upload Menu**: Drag and drop or click to upload a menu file
2. **Review Candidates**: Browse AI-detected entree names with confidence scores
3. **Approve/Deny/Edit**: Use buttons or keyboard shortcuts (A/D/E)
4. **Save Results**: Click "Save Approved Entrees" to persist to database

### Keyboard Shortcuts
- `↑/↓`: Navigate candidates
- `A`: Approve selected candidate
- `D`: Deny selected candidate
- `E`: Edit selected candidate

### External Integration

```javascript
// Process a menu file
const formData = new FormData()
formData.append('file', menuFile)

const response = await fetch('/api/mlmp/process', {
  method: 'POST',
  body: formData
})

const { menu_id, candidates } = await response.json()

// Get approved entrees
const entreesResponse = await fetch(`/api/mlmp/entrees?menu_id=${menu_id}`)
const { entrees } = await entreesResponse.json()
```

## 🔧 Configuration

### OCR Provider
Currently supports Tesseract.js. Future providers can be added by implementing the `OcrProvider` interface.

### Feature Engineering
The system extracts 14+ features per candidate:
- Token count and length
- Price proximity
- Section header context
- Typography hints (caps, title case)
- Punctuation density
- Character quality ratios

### ML Model
- **Architecture**: 2-3 dense layers with dropout
- **Input**: Combined feature vector + character/word embeddings
- **Output**: Binary classification (is_entree_name)
- **Training**: Online learning from user feedback

## 📊 Performance

- **OCR Speed**: ~2-5 seconds per page on modern hardware
- **Candidate Detection**: <1 second for typical menu
- **ML Prediction**: <100ms per candidate
- **Accuracy**: 80%+ precision on top-30 candidates

## 🚀 Deployment

### Vercel (Recommended)
1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Manual Deployment
```bash
npm run build
npm run preview
```

### Environment Variables for Production
```env
VITE_SUPABASE_URL=your_production_supabase_url
VITE_SUPABASE_ANON_KEY=your_production_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_production_service_key
VITE_OCR_PROVIDER=tesseract
VITE_DEV_MODE=false
```

## 🔒 Security

- **Row Level Security**: Supabase RLS policies protect user data
- **File Validation**: Type and size restrictions on uploads
- **Rate Limiting**: API endpoints include rate limiting
- **Authentication**: JWT-based auth for user operations

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

- **Issues**: Report bugs and feature requests on GitHub
- **Documentation**: Check this README and inline code comments
- **Community**: Join our Discord server for discussions

## 🗺️ Roadmap

- [ ] Additional OCR providers (Google Vision, Azure)
- [ ] Multi-language support
- [ ] Active learning for uncertain candidates
- [ ] Batch processing API
- [ ] Advanced analytics dashboard
- [ ] Mobile app

## 🙏 Acknowledgments

- **Tesseract.js** for browser-based OCR
- **TensorFlow.js** for client-side ML
- **Supabase** for backend infrastructure
- **React** and **Vite** for the frontend framework
