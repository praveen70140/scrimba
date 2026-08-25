import * as vscode from 'vscode';

export class MyCoursesViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    
    const newCourseItem = new vscode.TreeItem('Create New Course', vscode.TreeItemCollapsibleState.None);
    newCourseItem.command = { command: 'scrim.newCourse', title: 'New Course' };
    newCourseItem.iconPath = new vscode.ThemeIcon('add');

    return Promise.resolve([newCourseItem]);
  }
}
