package backend.users.controller;

import backend.common.annotation.RequirePermission;
import backend.common.constants.PermissionConstants;
import backend.common.utils.ResponseMessage;
import backend.users.dto.CreateRoleDto;
import backend.users.dto.UpdateRoleDto;
import backend.users.entity.RoleEntity;
import backend.users.service.RoleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/roles")
@Tag(name = "Roles", description = "API for managing roles")
public class RoleController {

    @Autowired
    private RoleService roleService;

    @RequirePermission(PermissionConstants.CREAR_ROL)
    @Operation(summary = "Create a new role")
    @PostMapping
    public ResponseEntity<ResponseMessage<RoleEntity>> createRole(@Valid @RequestBody CreateRoleDto createRoleDto) {
        return ResponseEntity.ok(roleService.createRole(createRoleDto));
    }

    @RequirePermission(PermissionConstants.EDITAR_ROL)
    @Operation(summary = "Update an existing role")
    @PutMapping("/{id}")
    public ResponseEntity<ResponseMessage<RoleEntity>> updateRole(@PathVariable UUID id, @Valid @RequestBody UpdateRoleDto updateRoleDto) {
        return ResponseEntity.ok(roleService.updateRole(id, updateRoleDto));
    }

    @RequirePermission(PermissionConstants.LISTAR_ROL)
    @Operation(summary = "Get a role by ID")
    @GetMapping("/{id}")
    public ResponseEntity<ResponseMessage<RoleEntity>> getRoleById(@PathVariable UUID id) {
        return ResponseEntity.ok(roleService.getRoleById(id));
    }

    @RequirePermission(PermissionConstants.ELIMINAR_ROL)
    @Operation(summary = "Delete a role by ID")
    @DeleteMapping("/{id}")
    public ResponseEntity<ResponseMessage<Void>> deleteRole(@PathVariable UUID id) {
        return ResponseEntity.ok(roleService.deleteRole(id));
    }

    @RequirePermission(PermissionConstants.LISTAR_ROL)
    @Operation(summary = "Get all roles")
    @GetMapping
    public ResponseEntity<ResponseMessage<List<RoleEntity>>> getAllRoles() {
        return ResponseEntity.ok(roleService.getAllRoles());
    }
}
