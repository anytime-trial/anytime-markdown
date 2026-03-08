'use client';

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import LandingHeader from '../../components/LandingHeader';
import SiteFooter from '../../components/SiteFooter';
import FileListPanel from './FileListPanel';
import CategoryAreaPanel from './CardAreaPanel';
import { useLayoutEditor } from './useLayoutEditor';

export default function EditBody() {
  const editor = useLayoutEditor();
  const {
    t,
    tCommon,
    files,
    categories,
    siteDescription,
    setSiteDescription,
    loading,
    snackbar,
    setSnackbar,
    editCategory,
    setEditCategory,
    editItems,
    editFormRef,
    deleteTarget,
    setDeleteTarget,
    fileInputRef,
    sensors,
    activeCategory,
    handleUpload,
    handleDeleteFile,
    handleAddCategory,
    handleDeleteCategory,
    handleRemoveItem,
    handleUpdateField,
    handleUpdateItemDisplayName,
    handleReorderItems,
    handleDropFile,
    handleDropUrl,
    urlLinks,
    handleAddUrlLink,
    handleDeleteUrlLink,
    handleDragStart,
    handleDragEnd,
    handleEditOpen,
    handleEditAddItem,
    handleEditRemoveItem,
    handleEditItemDisplayName,
    handleEditSave,
    handleSave,
  } = editor;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <LandingHeader />
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }} role="status">
          <CircularProgress aria-label="Loading" />
        </Box>
        <SiteFooter />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <LandingHeader />
      <Container maxWidth="lg" sx={{ flex: 1, py: 4, px: { xs: 2, md: 4 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Typography
            variant="h3"
            component="h1"
            sx={{
              fontWeight: 700,
              color: 'text.primary',
              fontSize: { xs: '1.8rem', md: '2.4rem' },
            }}
          >
            {t('sitesEdit')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: 2,
                bgcolor: 'secondary.main',
                color: '#000000',
                '&:hover': { bgcolor: 'secondary.dark' },
              }}
            >
              {t('sitesSave')}
            </Button>
          </Box>
        </Box>

        <TextField
          label={t('siteDescription')}
          value={siteDescription}
          onChange={(e) => setSiteDescription(e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 3 }}
        />

        <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
          <FileListPanel
            files={files}
            fileInputRef={fileInputRef}
            onUpload={handleUpload}
            onDeleteRequest={setDeleteTarget}
            urlLinks={urlLinks}
            onAddUrlLink={handleAddUrlLink}
            onDeleteUrlLink={handleDeleteUrlLink}
            t={t}
          />
          <CategoryAreaPanel
            categories={categories}
            activeCategory={activeCategory}
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDelete={handleDeleteCategory}
            onRemoveItem={handleRemoveItem}
            onUpdateField={handleUpdateField}
            onUpdateItemDisplayName={handleUpdateItemDisplayName}
            onReorderItems={handleReorderItems}
            onDropFile={handleDropFile}
            onDropUrl={handleDropUrl}
            onAdd={handleAddCategory}
            t={t}
          />
        </Box>
      </Container>
      <SiteFooter />

      {/* ファイル削除確認ダイアログ */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} aria-labelledby="delete-dialog-title">
        <DialogTitle id="delete-dialog-title">{t('docsDelete')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('docsDeleteConfirm')}
            {deleteTarget && (
              <Box component="span" sx={{ display: 'block', mt: 1, fontWeight: 600 }}>
                {deleteTarget.name}
              </Box>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{tCommon('cancel')}</Button>
          <Button onClick={handleDeleteFile} color="error" variant="contained">
            {t('docsDelete')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* カテゴリ編集ダイアログ */}
      <Dialog open={!!editCategory} onClose={() => setEditCategory(null)} maxWidth="sm" fullWidth aria-labelledby="edit-dialog-title">
        <DialogTitle id="edit-dialog-title">{t('sitesEdit')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label={t('sitesCategoryTitle')}
            defaultValue={editCategory?.title ?? ''}
            onChange={(e) => { editFormRef.current.title = e.target.value; }}
            fullWidth
            size="small"
          />
          <TextField
            label={t('sitesCategoryDescription')}
            defaultValue={editCategory?.description ?? ''}
            onChange={(e) => { editFormRef.current.description = e.target.value; }}
            fullWidth
            size="small"
            multiline
            rows={3}
          />

          <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 1 }}>
            {t('sitesCategoryItems')}
          </Typography>

          {editItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('sitesCategoryEmpty')}
            </Typography>
          ) : (
            <List dense disablePadding>
              {editItems.map((item) => (
                <ListItem
                  key={item.docKey}
                  disablePadding
                  secondaryAction={
                    <IconButton
                      edge="end"
                      size="small"
                      aria-label={t('sitesCategoryRemoveItem')}
                      onClick={() => handleEditRemoveItem(item.docKey)}
                      sx={{ '&:hover': { color: 'error.main' } }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                  sx={{ pr: 5 }}
                >
                  <ListItemText
                    primary={
                      <TextField
                        size="small"
                        variant="standard"
                        defaultValue={item.displayName}
                        onChange={(e) => handleEditItemDisplayName(item.docKey, e.target.value)}
                        fullWidth
                        placeholder={t('sitesItemDisplayName')}
                      />
                    }
                    secondary={item.docKey}
                  />
                </ListItem>
              ))}
            </List>
          )}

          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            {t('sitesCategoryAddItem')}
          </Typography>
          <Box sx={{ maxHeight: 200, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <List dense disablePadding>
              {files.map((file) => {
                const alreadyAdded = editItems.some((item) => item.docKey === file.key);
                return (
                  <ListItem key={file.key} disablePadding>
                    <Button
                      size="small"
                      onClick={() => handleEditAddItem(file)}
                      disabled={alreadyAdded}
                      fullWidth
                      sx={{ justifyContent: 'flex-start', textTransform: 'none', px: 2, opacity: alreadyAdded ? 0.5 : 1 }}
                    >
                      {file.name}
                    </Button>
                  </ListItem>
                );
              })}
            </List>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditCategory(null)}>{tCommon('cancel')}</Button>
          <Button onClick={handleEditSave} variant="contained">{tCommon('ok')}</Button>
        </DialogActions>
      </Dialog>

      {/* スナックバー */}
      <Snackbar
        open={!!snackbar}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snackbar ? (
          <Alert severity={snackbar.severity} onClose={() => setSnackbar(null)} variant="filled">
            {snackbar.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
